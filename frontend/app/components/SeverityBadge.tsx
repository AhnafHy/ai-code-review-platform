export default function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    LOW: 'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${styles[severity] || 'bg-gray-100 text-gray-700'}`}>
      {severity}
    </span>
  )
}