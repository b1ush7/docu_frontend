import { getData } from './http'

export interface TrendPoint {
  date: string
  newUsers: number
  uploadedFiles: number
  createdTasks: number
  succeededTasks: number
  failedTasks: number
}
export interface StatisticsTrend {
  from: string
  to: string
  timezone: string
  points: TrendPoint[]
}
export const statisticsApi = {
  trend(from: string, to: string): Promise<StatisticsTrend> {
    return getData<StatisticsTrend>('/admin/statistics/trend', { params: { from, to } })
  },
}
