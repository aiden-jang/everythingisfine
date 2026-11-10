import { journeys } from "./catalogue";
import { useStoryNavigation } from "./StoryNavigation";

export function JourneyPicker() {
  const navigation = useStoryNavigation();
  if (!navigation) return null;
  return (
    <section className="stories-group" aria-label="Guided journeys">
      <h3>Guided journeys · move at your own pace</h3>
      <div>
        {journeys.map((journey) => (
          <button
            type="button"
            id={`journey-${journey.id}`}
            key={journey.id}
            disabled={!!navigation.unavailable(journey.steps[0]!.id)}
            onClick={() => navigation.start(journey.id)}
          >
            <span>{journey.title}</span>
            <small>
              {journey.steps.length} views · {journey.summary}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
