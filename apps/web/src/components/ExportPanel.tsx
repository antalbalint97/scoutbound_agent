interface ExportPanelProps {
  selectedCount: number;
  isExportingJson: boolean;
  isExportingCsv: boolean;
  onDownloadJson: () => Promise<void>;
  onDownloadCsv: () => void;
}

export function ExportPanel({
  selectedCount,
  isExportingJson,
  isExportingCsv,
  onDownloadJson,
  onDownloadCsv,
}: ExportPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header compact">
        <p className="eyebrow">Export</p>
        <h2>Download results</h2>
      </div>

      <p className="muted">
        Export the currently selected leads as raw JSON payload or a flat CSV snapshot.
      </p>

      <div className="button-row">
        <button
          className="secondary-button"
          disabled={selectedCount === 0 || isExportingJson}
          onClick={() => void onDownloadJson()}
          type="button"
        >
          {isExportingJson ? "Preparing JSON..." : `Download JSON (${selectedCount})`}
        </button>
        <button
          className="secondary-button"
          disabled={selectedCount === 0 || isExportingCsv}
          onClick={onDownloadCsv}
          type="button"
        >
          {isExportingCsv ? "Preparing CSV..." : `Download CSV (${selectedCount})`}
        </button>
      </div>
    </section>
  );
}
