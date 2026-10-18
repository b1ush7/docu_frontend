// 【重要】预览模式：跳过登录校验直接查看后台界面效果。
// 曾经硬编码为 true，导致部署后任何人无需登录即可进入工作台与 /admin 管理端
// （router 守卫在 PREVIEW_MODE 下直接 return true，等同于关闭全部鉴权）。
// 现已关闭，恢复真实登录流程。仅当需要单独预览界面且已确认不在公网暴露时才临时改回 true。
export const PREVIEW_MODE = false

// 预览模式下注入的假管理员身份
export const PREVIEW_USER = {
  id: -1,
  username: '预览管理员',
  role: 'ADMIN',
}
