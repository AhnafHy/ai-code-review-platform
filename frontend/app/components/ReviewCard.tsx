import Link from 'next/link'
import StatusBadge from './StatusBadge'
import { GitPullRequest, ChevronRight } from 'lucide-react'

interface ReviewCardProps {
  review: {
    review_id: string
    status: string
    repo: string
    pr_number: number
    pr_title: string
    overall_score: number
    created_at: string
    security_count?: number
    performance_count?: number
    quality_count?: number
  }
}

export default function ReviewCard({ review }: ReviewCardProps) {
  const scoreColor = review.overall_score >= 80 ? 'text-green-600' :
                     review.overall_score >= 60 ? 'text-yellow-600' : 'text-red-600'

  return (
    <Link href={`/reviews/${review.review_id}`}>
      <div className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <GitPullRequest size={18} className="text-emerald-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">{review.pr_title || `PR #${review.pr_number}`}</span>
              <StatusBadge status={review.status} />
            </div>
            <p className="text-xs text-gray-400">{review.repo} · PR #{review.pr_number} · {new Date(review.created_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 ml-4">
          {review.status === 'COMPLETED' && (
            <span className={`text-lg font-semibold ${scoreColor}`}>{review.overall_score}</span>
          )}
          <ChevronRight size={18} className="text-gray-400" />
        </div>
      </div>
    </Link>
  )
}