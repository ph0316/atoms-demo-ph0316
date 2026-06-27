import { ALLOWED_DEPENDENCIES, ALLOWED_FILE_PREFIXES, DEFAULT_FILES, REQUIRED_FILES } from "@/lib/constants";
import type { SandpackFiles } from "@/lib/schemas";

const allowedDependencySet = new Set<string>(ALLOWED_DEPENDENCIES);

export function normalizeFiles(files: SandpackFiles): SandpackFiles {
  const normalized: SandpackFiles = {};
  for (const [path, value] of Object.entries(files)) {
    const safePath = normalizePath(path);
    if (!isAllowedPath(safePath)) continue;
    normalized[safePath] = {
      code: stripDangerousHtml(value.code),
      active: value.active,
      hidden: value.hidden,
      readOnly: value.readOnly,
    };
  }

  for (const requiredPath of REQUIRED_FILES) {
    if (!normalized[requiredPath]) {
      normalized[requiredPath] = DEFAULT_FILES[requiredPath];
    }
  }

  normalized["/package.json"] = {
    ...normalized["/package.json"],
    hidden: true,
    code: sanitizePackageJson(normalized["/package.json"]?.code),
  };
  normalized["/src/main.tsx"] = {
    ...normalized["/src/main.tsx"],
    hidden: true,
  };

  addMissingRelativeImportStubs(normalized);

  if (!Object.values(normalized).some((file) => file.active)) {
    normalized["/src/App.tsx"] = { ...normalized["/src/App.tsx"], active: true };
  }

  return normalized;
}

export function isAllowedPath(path: string) {
  if (REQUIRED_FILES.includes(path as (typeof REQUIRED_FILES)[number])) return true;
  return ALLOWED_FILE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function sanitizePackageJson(code = DEFAULT_FILES["/package.json"].code) {
  try {
    const parsed = JSON.parse(code) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies: Record<string, string> = {};
    for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
      if (allowedDependencySet.has(name)) {
        dependencies[name] = version || "latest";
      }
    }
    for (const required of ["vite", "@vitejs/plugin-react", "typescript", "react", "react-dom", "react-is"]) {
      dependencies[required] = dependencies[required] ?? "latest";
    }
    return JSON.stringify(
      {
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite build",
        },
        dependencies,
        devDependencies: {},
      },
      null,
      2,
    );
  } catch {
    return DEFAULT_FILES["/package.json"].code;
  }
}

export function normalizePath(path: string) {
  const clean = path.replaceAll("\\", "/").trim();
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function stripDangerousHtml(code: string) {
  return code
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+=["'][^"']*["']/gi, "");
}

type MissingImport = {
  defaultName?: string;
  namedExports: string[];
  targetPath: string;
};

function addMissingRelativeImportStubs(files: SandpackFiles) {
  const missing = new Map<string, MissingImport>();

  for (const [filePath, file] of Object.entries(files)) {
    if (!isSourceCodeFile(filePath)) continue;
    for (const item of findRelativeImports(filePath, file.code, files)) {
      const existing = missing.get(item.targetPath);
      if (existing) {
        existing.defaultName = existing.defaultName ?? item.defaultName;
        existing.namedExports = Array.from(new Set([...existing.namedExports, ...item.namedExports]));
      } else {
        missing.set(item.targetPath, item);
      }
    }
  }

  for (const item of missing.values()) {
    files[item.targetPath] = {
      code: createImportStub(item),
      hidden: false,
    };
  }
}

function findRelativeImports(importerPath: string, code: string, files: SandpackFiles): MissingImport[] {
  const imports: MissingImport[] = [];
  const importPattern = /import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g;
  for (const match of code.matchAll(importPattern)) {
    const importClause = match[1].trim();
    const importSource = match[2].trim();
    if (importClause.startsWith("type ") || importSource.endsWith(".css")) continue;
    const targetPath = findMissingImportTarget(importerPath, importSource, files);
    if (!targetPath) continue;
    imports.push({
      targetPath,
      defaultName: parseDefaultImportName(importClause),
      namedExports: parseNamedImportNames(importClause),
    });
  }
  return imports;
}

function findMissingImportTarget(importerPath: string, importSource: string, files: SandpackFiles) {
  const basePath = resolveRelativePath(importerPath, importSource);
  if (!basePath.startsWith("/src/")) return null;
  const candidates = hasKnownExtension(basePath)
    ? [basePath]
    : [`${basePath}.tsx`, `${basePath}.ts`, `${basePath}.jsx`, `${basePath}.js`, `${basePath}/index.tsx`];
  if (candidates.some((candidate) => Boolean(files[candidate]))) return null;
  return candidates[0];
}

function createImportStub(item: MissingImport) {
  const fallbackName = sanitizeIdentifier(fileBaseName(item.targetPath), "GeneratedPanel");
  const defaultName = item.defaultName ? sanitizeIdentifier(item.defaultName, fallbackName) : undefined;
  const namedExports = Array.from(
    new Set(item.namedExports.map((name) => sanitizeIdentifier(name, fallbackName)).filter(Boolean)),
  );
  const declarations = new Map<string, ReturnType<typeof labelForComponent>>();
  if (defaultName) declarations.set(defaultName, labelForComponent(defaultName));
  for (const name of namedExports) declarations.set(name, labelForComponent(name));
  if (declarations.size === 0) declarations.set(fallbackName, labelForComponent(fallbackName));

  const componentBlocks = Array.from(declarations.entries())
    .map(
      ([name, label]) => `const ${name} = (_props: AnyProps) => (
  <section style={panelStyle}>
    <strong>{${JSON.stringify(label.title)}}</strong>
    <span>{${JSON.stringify(label.detail)}}</span>
  </section>
);`,
    )
    .join("\n\n");
  const exportNames = Array.from(declarations.keys());

  return `type AnyProps = Record<string, unknown>;

const panelStyle = {
  display: "grid",
  gap: 8,
  border: "1px solid #dce0eb",
  borderRadius: 8,
  background: "#fff",
  padding: 16,
  color: "#15171c",
  lineHeight: 1.5,
} as const;

${componentBlocks}

${defaultName ? `export default ${defaultName};\n` : ""}export { ${exportNames.join(", ")} };
`;
}

function parseDefaultImportName(importClause: string) {
  if (importClause.startsWith("{") || importClause.startsWith("*")) return undefined;
  const name = importClause.split(",")[0]?.trim();
  return name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : undefined;
}

function parseNamedImportNames(importClause: string) {
  const namedMatch = importClause.match(/\{([\s\S]*?)\}/);
  if (!namedMatch) return [];
  return namedMatch[1]
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, ""))
    .map((part) => part.split(/\s+as\s+/i).pop()?.trim() ?? "")
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function resolveRelativePath(importerPath: string, importSource: string) {
  const baseParts = importerPath.split("/").slice(0, -1);
  const sourceParts = importSource.split("/");
  const parts = [...baseParts];
  for (const part of sourceParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function hasKnownExtension(path: string) {
  return /\.(tsx|ts|jsx|js)$/.test(path);
}

function isSourceCodeFile(path: string) {
  return /\.(tsx|ts|jsx|js)$/.test(path);
}

function fileBaseName(path: string) {
  return path.split("/").pop()?.replace(/\.(tsx|ts|jsx|js)$/, "") || "GeneratedPanel";
}

function sanitizeIdentifier(value: string, fallback: string) {
  const cleaned = value.replace(/[^\w$]/g, "");
  return /^[A-Za-z_$][\w$]*$/.test(cleaned) ? cleaned : fallback;
}

function labelForComponent(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("upload")) {
    return { title: "上传简历", detail: "模型未返回该组件文件，已生成可预览的上传区域占位。" };
  }
  if (lower.includes("score") || lower.includes("radar")) {
    return { title: "评分面板", detail: "模型未返回该组件文件，已生成可预览的评分区域占位。" };
  }
  if (lower.includes("advice") || lower.includes("recommend")) {
    return { title: "建议面板", detail: "模型未返回该组件文件，已生成可预览的建议区域占位。" };
  }
  return { title: name, detail: "模型拆分了辅助模块但没有返回文件，系统已补齐占位组件。" };
}
