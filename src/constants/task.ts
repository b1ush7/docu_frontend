/**
 * @file 任务展示常量与文案映射
 * @description 任务状态 / 类型 / 步骤状态的中文文案映射，供任务列表与任务详情共用，
 *              避免同一映射在多个组件中重复维护。
 */
import type { StepStatus, TaskStatus, TaskType } from '@/api/types'

/** 任务状态 → 展示文案映射 */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '已失败',
  CANCELLED: '已取消',
}

/** 任务类型 → 展示名称映射（任务记录无独立名称字段，以类型 + 指令摘要作名称） */
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  OCR: '文字识别',
  CONVERT: '格式转换',
  AI_EDIT: 'AI 编辑',
  EXPORT: '导出',
  IMAGE_GEN: '图片生成',
}

/** 任务步骤状态 → 展示文案映射（比任务状态多一个 SKIPPED） */
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  PENDING: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  FAILED: '已失败',
  SKIPPED: '已跳过',
}

/**
 * 任务状态展示文案
 * @param status 任务状态
 * @returns 中文文案（未知状态原样返回，便于排查新枚举）
 */
export function taskStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status] ?? status
}

/**
 * 任务类型展示名称
 * @param type 任务类型
 * @returns 中文名称（未知类型原样返回）
 */
export function taskTypeLabel(type: TaskType): string {
  return TASK_TYPE_LABELS[type] ?? type
}

/**
 * 任务步骤状态展示文案
 * @param status 步骤状态
 * @returns 中文文案（未知状态原样返回）
 */
export function stepStatusLabel(status: StepStatus): string {
  return STEP_STATUS_LABELS[status] ?? status
}
