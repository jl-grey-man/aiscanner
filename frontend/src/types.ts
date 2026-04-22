export type CardStatus = 'good' | 'warning' | 'bad'

export interface ReportCard {
  id: number
  title: string
  status: CardStatus
  finding: string
  details: string[]
  why: string
  impact: string
  fix: string
}

export interface Summary {
  score: number
  good: number
  warning: number
  bad: number
}

export type AnalysisState = 'idle' | 'scanning' | 'done' | 'error'
