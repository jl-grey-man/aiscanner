interface Props {
  onClick: () => void
  loading: boolean
  error: string | null
}

export function FullScanButton({ onClick, loading, error }: Props) {
  return (
    <div className="mt-10 p-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-accent/30 rounded-2xl text-center shadow-lg">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-accent text-white rounded-full mb-4 text-2xl">
        🚀
      </div>
      <h3 className="font-bold text-xl text-gray-900 mb-2">Vill du se hur du står mot konkurrenterna?</h3>
      <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto leading-relaxed">
        Full analys av Google Business Profile, recensioner, NAP-konsistens och konkurrenter.
      </p>
      <button
        onClick={onClick}
        disabled={loading}
        className="px-8 py-3.5 bg-accent hover:bg-blue-700 text-white rounded-xl font-bold text-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyserar marknaden...
          </span>
        ) : (
          'Kör Full Analys'
        )}
      </button>
      {error && <p className="text-red-600 mt-3 text-sm font-medium">{error}</p>}
    </div>
  )
}
