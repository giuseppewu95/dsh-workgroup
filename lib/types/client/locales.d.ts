/**
 * Workgroup panel copy: Chinese product copy with an English mirror, in the
 * shape `@deepseek-ai/dsh-client-locale` consumes.
 *
 * @module dsh-workgroup/src/client/locales
 */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "workgroup";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly 'count.zero': "无工作群";
    readonly 'count.one': "1 个工作群";
    readonly 'count.other': "{count} 个工作群";
    readonly 'tree.aria': "工作群成员";
    readonly 'group.owner': "创建者";
    readonly 'member.open': "打开该会话";
    readonly 'member.running': "运行中";
    readonly 'member.inactive': "空闲";
    readonly 'time.just_now': "刚刚";
    readonly 'time.minutes_ago': "{n} 分钟前";
    readonly 'time.hours_ago': "{n} 小时前";
    readonly 'time.days_ago': "{n} 天前";
    readonly empty: "本会话不属于任何工作群。";
    readonly 'load.error': "工作群加载失败";
    readonly retry: "重试";
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<WorkgroupKey, string>;
/** Key domain of the `workgroup` namespace (zh is the source of truth). */
export type WorkgroupKey = keyof typeof zh;
