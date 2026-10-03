import { ExplanationSummary } from "../components/ExplanationSummary";
import { formatPercent, modelName } from "../lib/format";
import type { ModelInfo, Prediction } from "../types";

// Real API output for the "Caught fraud" example, kept as a fixed illustration.
const EXAMPLE: Prediction = {
  fraud_probability: 0.9881,
  is_fraud: true,
  threshold: 0.6283,
  model: "xgboost",
  base_value: -6.734,
  top_features: null,
  explanation: {
    amount: { value: 219.8, percentile: 90.79, contribution: 0.913, direction: "raised", odds_multiplier: 2.49, strength: "moderate" },
    anonymised: {
      combined_contribution: 10.239,
      direction: "raised",
      odds_multiplier: 27973,
      strength: "strong",
      raised_count: 17,
      lowered_count: 11,
      extreme_count: 6,
    },
    unusualness: {
      percentile: 99.97,
      comparison_group: "legitimate transactions the model learned from",
      extreme_feature_count: 6,
      rarity_threshold: 0.001,
      summary:
        "Less typical than about 99.97% of the legitimate transactions the model learned from. 6 of the 28 anonymised characteristics are rarer than 1 in 1,000 of them. Unusual does not necessarily mean fraudulent.",
    },
    technical: { base_value: -6.734, top_features: [], feature_percentiles: {} },
    reference: { dataset_description: "", model_version: "" },
  },
};

export function GuideView({ model }: { model: ModelInfo }) {
  const threshold = formatPercent(model.threshold);
  const borderline = formatPercent(model.threshold / 2);

  return (
    <article className="narrow guide">
      <h1 className="view-title">How to use FraudGuard</h1>
      <p className="view-lede">
        FraudGuard estimates how likely a card transaction is to be fraud and explains what drove that estimate. The model
        behind it, {modelName(model.model)}, learned from real card transactions.
      </p>

      <h2 className="section-title">What FraudGuard can tell you</h2>
      <ul className="body-copy guide-list">
        <li><strong>The fraud chance</strong>: the model's estimate, from 0% to 100%.</li>
        <li><strong>The verdict</strong>: whether that chance is high enough to flag the transaction.</li>
        <li><strong>The amount's effect</strong>: whether the transaction amount pushed the score up or down, and how much.</li>
        <li><strong>The anonymised characteristics' effect</strong>: the combined push from the other 28 inputs.</li>
        <li><strong>How unusual the transaction is</strong> compared with the legitimate transactions the model learned from.</li>
      </ul>

      <h2 className="section-title">What FraudGuard cannot tell you</h2>
      <ul className="body-copy guide-list">
        <li>
          V1 to V28 are anonymised characteristics from the source dataset. Their original real-world meanings are not
          available, so FraudGuard can't say what any one of them represents.
        </li>
        <li>An unusual transaction is not automatically fraudulent. Plenty of genuine transactions are unusual.</li>
        <li>The model's reasons are not proof of fraud; they explain how the model arrived at its score.</li>
        <li>
          It knows nothing about a cardholder's own history. The data has no customer identity, and it covers two days in
          September 2013, so today's transactions may look different.
        </li>
      </ul>

      <h2 className="section-title">Check one transaction</h2>
      <ol className="steps">
        <li>
          Open <a href="#check">Check</a> and choose a transaction: pick one of the three examples, paste a row from a
          dataset file, or upload a whole CSV file.
        </li>
        <li>
          Optionally change the <strong>transaction amount</strong>. That's an amount what-if: the 28 anonymised
          characteristics stay as they are in the record, so you see the effect of the amount alone.
        </li>
        <li>
          Select <strong>Check transaction</strong>, or <strong>Check and record</strong> to also save the result to the
          log.
        </li>
      </ol>
      <p className="body-copy">
        Analysts can also type all 29 inputs under <strong>Advanced: enter anonymised model features</strong>.
      </p>

      <h2 className="section-title">Reading the verdict</h2>
      <dl className="terms">
        <div>
          <dt>Likely fraud</dt>
          <dd>The fraud chance is {threshold} or higher, so the transaction is flagged.</dd>
        </div>
        <div>
          <dt>Borderline, not flagged</dt>
          <dd>
            Between {borderline} and {threshold}. Not flagged, but close enough to the line that a person should take a
            look.
          </dd>
        </div>
        <div>
          <dt>Looks legitimate</dt>
          <dd>Under {borderline}. The model sees nothing pointing to fraud.</dd>
        </div>
      </dl>

      <h2 className="section-title">What drove this score</h2>
      <p className="body-copy">Under every verdict, FraudGuard explains the score in three parts. This is the caught fraud example:</p>
      <div className="guide-figure">
        <ExplanationSummary prediction={EXAMPLE} explanation={EXAMPLE.explanation!} headingLevel="h3" />
      </div>
      <ul className="body-copy guide-list">
        <li>
          <strong>Transaction amount</strong> compares the amount with legitimate transactions in the training data and
          says whether it raised or lowered the score.
        </li>
        <li>
          <strong>Anonymised characteristics</strong> are shown as one group, because their individual meanings aren't
          known. Their effects add up exactly, so the group's push is precise even though its parts can't be named.
        </li>
        <li>
          <strong>Overall transaction pattern</strong> measures how far the transaction sits from typical legitimate ones.
          It describes rarity, not fraud.
        </li>
        <li>
          In the chart, a <span className="swatch swatch-up">gold</span> bar pushed the score toward fraud and a{" "}
          <span className="swatch swatch-down">gray</span> bar pushed it away. If the black dot ends right of the gold
          line, the transaction is flagged. The scale is stretched at both ends so small chances like 0.1% stay readable.
        </li>
      </ul>

      <h2 className="section-title">Technical details</h2>
      <p className="body-copy">
        Every verdict has a collapsed <strong>Technical details</strong> section for analysts and developers. It shows the
        individual features with the largest effect (V17, V10 and so on), their raw values, their SHAP contributions in
        log-odds, and each value's percentile among legitimate training transactions. These are the model's actual inputs,
        not explanations of what the features mean.
      </p>
      <p className="body-copy">
        It also lists <em>odds multipliers</em>. A multiplier of ×2.5 means a contribution multiplied the odds of fraud by
        2.5. Odds aren't probability: ×2.5 takes a 1% chance to about 2.5%, but takes 50% to 71%, not 125%.
      </p>

      <h2 className="section-title">Check a file</h2>
      <ol className="steps">
        <li>
          Open <a href="#batch">Batch</a> and choose or drop a CSV file. The technical input format is a header row naming
          Amount and the anonymised model features V1 to V28, exactly as in creditcard.csv.
        </li>
        <li>Wait while it's scored. The whole 284,807-row dataset takes under a minute, and you can cancel at any time.</li>
        <li>
          Review the riskiest transactions, each with a short reason, and select <strong>Download results</strong> for
          every row.
        </li>
      </ol>
      <p className="body-copy">
        If the file has a Class column (1 for fraud, 0 for legitimate), you also see frauds <em>caught</em> and{" "}
        <em>missed</em>, legitimate transactions <em>cleared</em>, and <em>false alarms</em>. The 25 riskiest
        transactions each get a short reason. The file is read in your browser; only the 29 inputs per row are sent to the server.
      </p>

      <h2 className="section-title">The log</h2>
      <p className="body-copy">
        <a href="#log">Log</a> lists every transaction saved with Check and record, newest first, 25 to a page. Filter by
        Flagged or Cleared, and select a transaction's number to see its verdict and explanation again. Each entry keeps the
        model and threshold used at the time, so old decisions still make sense after the model is retrained.
      </p>

      <h2 className="section-title">The model page</h2>
      <p className="body-copy">
        <a href="#model">Model</a> shows how the model did on transactions it never saw during training, how the{" "}
        {threshold} threshold was chosen, and where the data comes from.
      </p>

      <h2 className="section-title">API key</h2>
      <p className="body-copy">
        Only needed if the person running the server has set one. When a check says the server requires an API key,
        select <strong>API key</strong> in the top bar, paste it, and select <strong>Save key</strong>. It's remembered
        in this browser until you clear it.
      </p>

      <h2 className="section-title">Words used here</h2>
      <dl className="terms">
        <div>
          <dt>Fraud chance</dt>
          <dd>The model's estimate, from 0% to 100%, that a transaction is fraud.</dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>
            The fraud chance at which a transaction is flagged, currently {threshold}. Lower would catch more fraud but
            flag more genuine customers.
          </dd>
        </div>
        <div>
          <dt>Percentile</dt>
          <dd>Where a value sits among legitimate training transactions: the 91st percentile is higher than 91% of them.</dd>
        </div>
        <div>
          <dt>Unusual</dt>
          <dd>Far from typical legitimate transactions. Not the same as fraudulent.</dd>
        </div>
        <div>
          <dt>Recall and precision</dt>
          <dd>Recall is the share of real frauds the model catches; precision is the share of flags that really are fraud.</dd>
        </div>
        <div>
          <dt>PR-AUC</dt>
          <dd>One number for how well the model ranks fraud above legitimate transactions, across every threshold. 1 is perfect.</dd>
        </div>
      </dl>

      <h2 className="section-title">If something goes wrong</h2>
      <dl className="terms">
        <div>
          <dt>The API isn't answering</dt>
          <dd>The server is stopped. Start it (see the README), then select Try again.</dd>
        </div>
        <div>
          <dt>This server requires an API key</dt>
          <dd>Add the key under API key in the top bar.</dd>
        </div>
        <div>
          <dt>An anonymised model feature is required or empty</dt>
          <dd>Pick an example or paste a full row, or fill in every field under Advanced.</dd>
        </div>
        <div>
          <dt>Missing these columns, or doesn't look like transaction data</dt>
          <dd>The file's header row must name the columns V1 to V28 and Amount exactly.</dd>
        </div>
        <div>
          <dt>Model not available</dt>
          <dd>No model has been trained on the server yet. Train it (see the README), then try again.</dd>
        </div>
      </dl>
    </article>
  );
}
