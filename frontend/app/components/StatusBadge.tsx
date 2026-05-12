export default function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
  }
  const icons: Record<string, string> = {
    PENDING: '⏳',
    PROCESSING: '⚙️',
    COMPLETED: '✅',
    FAILED: '❌',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {icons[status]} {status}
    </span>
  )
}