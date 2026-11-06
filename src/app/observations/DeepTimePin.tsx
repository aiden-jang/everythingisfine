export function DeepTimePin({ select }: { select: (option: string) => void }): JSX.Element {
  return (
    <details className="observation-details">
      <summary>Pin coordinates</summary>
      <form
        className="deep-time-pin"
        onSubmit={(event) => {
          event.preventDefault();
          const coordinates = new FormData(event.currentTarget);
          select(`pin:${Number(coordinates.get("longitude"))},${Number(coordinates.get("latitude"))}`);
        }}
      >
        <label>
          Latitude
          <input name="latitude" type="number" min="-90" max="90" step="any" inputMode="decimal" required />
        </label>
        <label>
          Longitude
          <input
            name="longitude"
            type="number"
            min="-180"
            max="180"
            step="any"
            inputMode="decimal"
            required
          />
        </label>
        <div className="observatory-actions">
          <button type="submit">Follow this point</button>
        </div>
      </form>
    </details>
  );
}
