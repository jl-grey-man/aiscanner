interface Props {
  onClick: () => void
  loading: boolean
  error: string | null
}

export function FullScanButton({ onClick, loading, error }: Props) {
  return (
    <div className="mt-10 p-6 bg-accent/5 border border-accent/15 rounded-xl text-center">
      <h3 className="font-bold text-lg mb-2">Vill du se hur du står mot konkurrenterna?</h3>
      <p className="text-sm text-muted mb-4 max-w-md mx-auto">
        Full analys av Google Business Profile, recensioner, NAP-konsistens och konkurrenter.
      </p>
      <button
        onClick={onClick}
        disabled={loading}
        className="px-6 py-3 bg-accent hover:bg-accent-glow text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
      >
        {loading ? 'Analyserar marknaden...' : 'Kör Full Scan'}
      </button>
      {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
    </div>
  )
}
