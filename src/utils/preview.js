// 【临时】预览模式：跳过登录校验直接查看后台界面效果
// 仅开发调试用，前后端联调前必须改为 false 或删除本文件引用
export const PREVIEW_MODE = true

// 预览模式下注入的假管理员身份
export const PREVIEW_USER = {
  id: -1,
  username: '预览管理员',
  role: 'ADMIN',
}
