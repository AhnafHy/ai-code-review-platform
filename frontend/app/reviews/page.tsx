'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import ReviewCard from '../components/ReviewCard'
import { GitPullRequest } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL

export default function Reviews() {
  const { data, isLoading } = useQuery({
    queryKey: ['reviews'],
    queryFn: () => axios.get(`${API}/reviews`).then(r => r.data),
    refetchInterval: 5000
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
    </div>
  )

  const reviews = data || []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">All Reviews</h1>
        <p className="text-gray-500 text-sm mt-1">{reviews.length} reviews total — refreshes every 5 seconds</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {reviews.length === 0 ? (
          <div className="p-12 text-center">
            <GitPullRequest className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-gray-400">No reviews yet — open a PR on a connected repository</p>
          </div>
        ) : (
          reviews.map((review: any) => (
            <ReviewCard key={review.review_id} review={review} />
          ))
        )}
      </div>
    </div>
  )
}