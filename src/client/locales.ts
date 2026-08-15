/**
 * Workgroup panel copy: Chinese product copy with an English mirror, in the
 * shape `@deepseek-ai/dsh-client-locale` consumes.
 *
 * @module dsh-workgroup/src/client/locales
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'workgroup'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'actions.open': '打开工作群',
  'actions.close': '关闭工作群',
  'count.zero': '无工作群',
  'count.one': '1 个工作群',
  'count.other': '{count} 个工作群',
  'tree.aria': '工作群成员',
  'group.owner': '创建者',
  'member.open': '打开该会话',
  'member.running': '运行中',
  'member.inactive': '空闲',
  'empty': '本会话不属于任何工作群。',
  'load.error': '工作群加载失败',
  'retry': '重试',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<WorkgroupKey, string> = {
  'actions.open': 'Open workgroups',
  'actions.close': 'Close workgroups',
  'count.zero': 'No workgroups',
  'count.one': '1 workgroup',
  'count.other': '{count} workgroups',
  'tree.aria': 'Workgroup members',
  'group.owner': 'Owner',
  'member.open': 'Open this session',
  'member.running': 'Running',
  'member.inactive': 'Idle',
  'empty': 'This session belongs to no workgroup.',
  'load.error': 'Failed to load workgroups',
  'retry': 'Retry',
}

/** Key domain of the `workgroup` namespace (zh is the source of truth). */
export type WorkgroupKey = keyof typeof zh
