'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import ReviewCard from './components/ReviewCard'
import { Bot, GitPullRequest, CheckCircle, XCircle } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => axios.get(`${API}/dashboard`).then(r => r.data),
    refetchInterval: 5000
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
    </div>
  )

  if (!data || data.total_reviews === 0) return (
    <div className="text-center py-20">
      <Bot className="mx-auto mb-4 text-gray-300" size={48} />
      <h2 className="text-xl font-semibold text-gray-700 mb-2">No reviews yet</h2>
      <p className="text-gray-400 mb-4">Connect a GitHub repository to start getting automated code reviews</p>
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 max-w-md mx-auto text-left">
        <p className="text-sm font-medium text-gray-700 mb-2">Setup instructions:</p>
        <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
          <li>Go to your GitHub repo settings</li>
          <li>Click Webhooks → Add webhook</li>
          <li>Set Payload URL to your API webhook endpoint</li>
          <li>Set Content type to application/json</li>
          <li>Set Secret to your webhook secret</li>
          <li>Select Pull requests events</li>
          <li>Open or update a PR to trigger a review</li>
        </ol>
      </div>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">AI-powered code review overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <GitPullRequest size={18} />
            <span className="text-sm">Total reviews</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{data.total_reviews}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-emerald-500 mb-2">
            <CheckCircle size={18} />
            <span className="text-sm">Completed</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{data.completed}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <XCircle size={18} />
            <span className="text-sm">Failed</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{data.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <Bot size={18} />
            <span className="text-sm">Avg score</span>
          </div>
          <p className="text-3xl font-semibold text-gray-900">{data.avg_score}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-900">Recent reviews</h2>
        </div>
        <div>
          {data.recent_reviews.map((review: any) => (
            <ReviewCard key={review.review_id} review={review} />
          ))}
        </div>
      </div>
    </div>
  )
}