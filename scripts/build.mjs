/**
 * 构建脚本 - 使用 esbuild 打包 TypeScript 代码
 */
import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { rmSync, existsSync, readFileSync, writeFileSync } from 'fs';

// 清理 dist 目录
if (existsSync('dist')) {
  rmSync('dist', { recursive: true });
}

// 共享配置
const sharedConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  external: [
    // 外部依赖（不打包，用户需要安装）
    'express', 'ws', 'uuid', 'dotenv',
  ],
};

// 构建 CLI 入口（带 shebang）
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
});

// 构建库入口（不带 shebang）
await esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

// 生成类型声明文件
console.log('生成类型声明文件...');
execSync('npx tsc -p tsconfig.build.json --emitDeclarationOnly', { stdio: 'inherit' });

console.log('构建完成！');
