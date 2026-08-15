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
  'count.zero': '无工作群',
  'count.one': '1 个工作群',
  'count.other': '{count} 个工作群',
  'tree.aria': '工作群成员',
  'group.owner': '创建者',
  'member.open': '打开该会话',
  'member.running': '运行中',
  'member.inactive': '空闲',
  'member.unavailable': '不可用',
  'time.just_now': '刚刚',
  'time.minutes_ago': '{n} 分钟前',
  'time.hours_ago': '{n} 小时前',
  'time.days_ago': '{n} 天前',
  'empty': '本会话不属于任何工作群。直接对模型说"创建标题为 X 的工作群"即可建群；或让其他会话把你加入已有群。',
  'load.error': '工作群加载失败',
  'retry': '重试',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<WorkgroupKey, string> = {
  'count.zero': 'No workgroups',
  'count.one': '1 workgroup',
  'count.other': '{count} workgroups',
  'tree.aria': 'Workgroup members',
  'group.owner': 'Owner',
  'member.open': 'Open this session',
  'member.running': 'Running',
  'member.inactive': 'Idle',
  'member.unavailable': 'Unavailable',
  'time.just_now': 'just now',
  'time.minutes_ago': '{n} min ago',
  'time.hours_ago': '{n} h ago',
  'time.days_ago': '{n} d ago',
  'empty': 'This session belongs to no workgroup. Tell the model "create a workgroup titled X" to start one, or have another session add you to an existing group.',
  'load.error': 'Failed to load workgroups',
  'retry': 'Retry',
}

/** Key domain of the `workgroup` namespace (zh is the source of truth). */
export type WorkgroupKey = keyof typeof zh
