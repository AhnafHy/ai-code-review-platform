import SeverityBadge from './SeverityBadge'

interface Finding {
  severity: string
  title: string
  description: string
  suggestion: string
  line_reference?: string
}

export default function FindingCard({ finding, category }: { finding: Finding, category: string }) {
  const categoryColors: Record<string, string> = {
    security: 'border-red-100',
    performance: 'border-orange-100',
    quality: 'border-blue-100',
  }

  return (
    <div className={`bg-white rounded-xl border p-4 ${categoryColors[category] || 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="text-sm font-medium text-gray-900">{finding.title}</span>
        </div>
        {finding.line_reference && (
          <span className="text-xs text-gray-400 font-mono">{finding.line_reference}</span>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-2">{finding.description}</p>
      <div className="bg-emerald-50 rounded-lg px-3 py-2">
        <p className="text-xs text-emerald-700"><span className="font-medium">💡 Fix:</span> {finding.suggestion}</p>
      </div>
    </div>
  )
}