export function DecisionTag({ flagged }: { flagged: boolean }) {
  return <span className={`tag ${flagged ? "tag-flagged" : "tag-cleared"}`}>{flagged ? "Flagged" : "Cleared"}</span>;
}
