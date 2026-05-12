'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, GitPullRequest, ExternalLink, Shield, Zap, Star, ThumbsUp } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge'
import SeverityBadge from '../../components/SeverityBadge'
import FindingCard from '../../components/FindingCard'

const API = process.env.NEXT_PUBLIC_API_URL

export default function ReviewDetail() {
  const params = useParams()
  const reviewId = params.id as string

  const { data, isLoading } = useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => axios.get(`${API}/reviews/${reviewId}`).then(r => r.data),
    refetchInterval: (data: any) =>
      data?.status === 'PENDING' || data?.status === 'PROCESSING' ? 3000 : false
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
    </div>
  )

  if (!data) return <div className="text-center py-12 text-gray-400">Review not found</div>

  const isPending = data.status === 'PENDING' || data.status === 'PROCESSING'
  const scoreColor = data.overall_score >= 80 ? 'text-green-600' :
                     data.overall_score >= 60 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div>
      <Link href="/reviews" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft size={16} /> Back to reviews
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <GitPullRequest size={18} className="text-emerald-500" />
              <h1 className="text-xl font-semibold text-gray-900">{data.pr_title || `PR #${data.pr_number}`}</h1>
              <StatusBadge status={data.status} />
            </div>
            <p className="text-sm text-gray-400">{data.repo} · PR #{data.pr_number} · by {data.author}</p>
            <p className="text-xs text-gray-400 mt-1">{data.head_branch} → {data.base_branch} · {data.commit_sha}</p>
          </div>
          <div className="flex items-center gap-3 ml-4">
            {data.status === 'COMPLETED' && (
              <div className="text-right">
                <p className={`text-4xl font-semibold ${scoreColor}`}>{data.overall_score}</p>
                <p className="text-xs text-gray-400">/ 100</p>
              </div>
            )}
            {data.pr_url && (
              <a href={data.pr_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
                <ExternalLink size={14} /> View PR
              </a>
            )}
          </div>
        </div>

        {isPending && (
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <div>
              <p className="text-sm font-medium text-blue-700">Review in progress</p>
              <p className="text-xs text-blue-500">Polling for updates every 3 seconds — GPT-4o-mini is analyzing the diff</p>
            </div>
          </div>
        )}

        {data.status === 'FAILED' && (
          <div className="bg-red-50 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-red-700">Review failed</p>
            <p className="text-xs text-red-500 mt-1">{data.error_message}</p>
          </div>
        )}

        {data.summary && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 mt-4">
            <p className="text-sm text-gray-700">{data.summary}</p>
          </div>
        )}
      </div>

      {data.status === 'COMPLETED' && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-red-100 p-4">
              <div className="flex items-center gap-2 text-red-500 mb-2">
                <Shield size={16} /> <span className="text-sm font-medium">Security</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{data.security?.length || 0}</p>
              <p className="text-xs text-gray-400">findings</p>
            </div>
            <div className="bg-white rounded-xl border border-orange-100 p-4">
              <div className="flex items-center gap-2 text-orange-500 mb-2">
                <Zap size={16} /> <span className="text-sm font-medium">Performance</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{data.performance?.length || 0}</p>
              <p className="text-xs text-gray-400">findings</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-100 p-4">
              <div className="flex items-center gap-2 text-blue-500 mb-2">
                <Star size={16} /> <span className="text-sm font-medium">Quality</span>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{data.quality?.length || 0}</p>
              <p className="text-xs text-gray-400">findings</p>
            </div>
          </div>

          {data.security?.length > 0 && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-3">
                <Shield size={16} className="text-red-500" /> Security Findings
              </h2>
              <div className="space-y-3">
                {data.security.map((f: any, i: number) => (
                  <FindingCard key={i} finding={f} category="security" />
                ))}
              </div>
            </div>
          )}

          {data.performance?.length > 0 && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-3">
                <Zap size={16} className="text-orange-500" /> Performance Findings
              </h2>
              <div className="space-y-3">
                {data.performance.map((f: any, i: number) => (
                  <FindingCard key={i} finding={f} category="performance" />
                ))}
              </div>
            </div>
          )}

          {data.quality?.length > 0 && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-3">
                <Star size={16} className="text-blue-500" /> Code Quality
              </h2>
              <div className="space-y-3">
                {data.quality.map((f: any, i: number) => (
                  <FindingCard key={i} finding={f} category="quality" />
                ))}
              </div>
            </div>
          )}

          {data.positives?.length > 0 && (
            <div className="mb-6">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-900 mb-3">
                <ThumbsUp size={16} className="text-emerald-500" /> What's Good
              </h2>
              <div className="bg-white rounded-xl border border-emerald-100 p-4">
                <ul className="space-y-1">
                  {data.positives.map((p: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-emerald-500 mt-0.5">✓</span> {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {data.diff_snippet && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Diff snippet</h2>
              <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">{data.diff_snippet}</pre>
              </div>
            </div>
          )}
        </>
      )}

      <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
        <p className="text-xs text-blue-600 font-medium mb-1">Review ID</p>
        <p className="text-xs text-blue-500 font-mono">{data.review_id}</p>
        <p className="text-xs text-blue-400 mt-1">Created: {new Date(data.created_at).toLocaleString()}</p>
        {data.completed_at && <p className="text-xs text-blue-400">Completed: {new Date(data.completed_at).toLocaleString()}</p>}
      </div>
    </div>
  )
}