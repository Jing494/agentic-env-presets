/**
 * One-off generator: produce the two env presets as EXACT copies of the
 * shipped Standard / PTC declarations, with one `env-identity` row inserted
 * after the persona row. Kept in the repo so the clones can be re-checked
 * against a future shipped release.
 *
 *   node gen-presets.mjs [path-to-dsh-web-app/presets]
 */
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT = '/data/data/com.dsharnessmobile.shell/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets';
const presetsDir = process.argv[2] ?? DEFAULT;

const ENV_ROW = `          - id: env-identity
            name: 'dsh-agentic-env-presets'
            config:
              identity: You are an AI coding agent working inside an agentic coding environment.
`;
// The persona row is the first plugin; agent-instructions is the second.
const AGENT_INSTRUCTIONS_ROW = `          - id: agent-instructions
`;

const specs = [
  {
    src: 'standard.patch.yml', out: 'presets-standard.patch.yml',
    oldRowId: 'preset-standard', newRowId: 'preset-standard-env',
    oldPresetId: 'standard', newPresetId: 'standard-env', shippedOrder: 1, order: 11,
    name: '标准模式（中性环境）',
    desc: '与标准模式的工具和策略完全一致，只把系统提示词里的产品名说明换成中性的「agent 编码环境」。',
  },
  {
    src: 'ptc.patch.yml', out: 'presets-ptc.patch.yml',
    oldRowId: 'preset-ptc', newRowId: 'preset-ptc-env',
    oldPresetId: 'ptc', newPresetId: 'ptc-env', shippedOrder: 2, order: 12,
    name: 'PTC 模式（中性环境）',
    desc: '与 PTC 模式的工具和策略完全一致（run_code 单入口），只把系统提示词里的产品名说明换成中性的「agent 编码环境」。',
  },
];

for (const s of specs) {
  let text = fs.readFileSync(path.join(presetsDir, s.src), 'utf8');

  text = text.replace(
    /^# Agent preset \w+: one `@deepseek-ai\/dsh-agent-preset` declaration inserted\n# after the web patch\. Edits saved from the Web editor override this row's\n# `config\.plugins` by id from the profile patch\.\n/,
    `# Agent preset ${s.newPresetId}: an EXACT copy of the shipped ${s.oldPresetId} declaration\n# with ONE extra row (env-identity). Every other plugin, group, config value,\n# disabled expression and isolate map below is copied verbatim from\n# @deepseek-ai/dsh-web-app/presets/${s.src}, so the tools and policies stay\n# identical. Only the Loader row id and the preset's own metadata differ.\n`,
  );

  if (!text.includes(`- id: ${s.oldRowId}\n`)) throw new Error(`row id not found in ${s.src}`);
  text = text.replace(`- id: ${s.oldRowId}\n`, `- id: ${s.newRowId}\n`);

  const oldMeta = `        id: ${s.oldPresetId}\n        order: ${s.shippedOrder}\n`;
  if (!text.includes(oldMeta)) throw new Error(`preset metadata not found in ${s.src}`);
  text = text.replace(
    oldMeta,
    `        id: ${s.newPresetId}\n        order: ${s.order}\n        name: ${s.name}\n        description: ${s.desc}\n`,
  );

  if (!text.includes(AGENT_INSTRUCTIONS_ROW)) throw new Error(`agent-instructions row not found in ${s.src}`);
  text = text.replace(AGENT_INSTRUCTIONS_ROW, ENV_ROW + AGENT_INSTRUCTIONS_ROW);

  fs.writeFileSync(path.resolve(import.meta.dirname ?? '.', s.out), text);
  console.log(`wrote ${s.out}: ${text.split('\n').length} lines`);
}
