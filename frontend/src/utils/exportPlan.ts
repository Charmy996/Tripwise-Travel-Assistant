import { FinalTripPlan } from '../types/tripwise';

export function formatPlanAsMarkdown(plan: FinalTripPlan): string {
  const lines: string[] = [];
  lines.push(`# ${plan.title}`);
  lines.push(`**Verification Status:** ${plan.verification_summary_status}`);
  lines.push(
    `**Origin:** ${plan.preferences.origin} | **Destination:** ${plan.preferences.destination}`
  );
  lines.push(
    `**Dates:** ${plan.preferences.departure_date} to ${plan.preferences.return_date} | **Travellers:** ${plan.preferences.travellers_count} (${plan.preferences.adults} Adult(s), ${plan.preferences.children} Child(ren))`
  );
  lines.push(
    `**Budget:** ${plan.preferences.currency} ${plan.preferences.budget_total.toLocaleString()} | **Style & Pace:** ${plan.preferences.travel_style} (${plan.preferences.pace})`
  );
  lines.push('');
  lines.push('## Executive Summary');
  lines.push(plan.trip_summary);
  lines.push('');

  if (plan.budget_breakdown) {
    const b = plan.budget_breakdown;
    lines.push('## Budget Estimate & Breakdown');
    lines.push(`- **Total Budget:** ${b.currency} ${b.total_budget.toLocaleString()}`);
    lines.push(`- **Total Estimated Local Cost:** ${b.currency} ${b.total_estimated_cost.toLocaleString()} (${b.budget_utilization_percent}% of budget)`);
    lines.push(`- **Accommodation:** ${b.currency} ${b.accommodation_estimate.toLocaleString()}`);
    lines.push(`- **Local Transport:** ${b.currency} ${b.transport_estimate.toLocaleString()}`);
    lines.push(`- **Activities & Entry Tickets:** ${b.currency} ${b.activities_and_entry_estimate.toLocaleString()}`);
    lines.push(`- **Food & Dining:** ${b.currency} ${b.food_and_dining_estimate.toLocaleString()}`);
    lines.push(`- **Contingency Buffer (8%):** ${b.currency} ${b.contingency_buffer.toLocaleString()}`);
    lines.push(`- *Basis:* ${b.basis_note}`);
    lines.push('');
  }

  lines.push('## Daily Indicative Itinerary');
  for (const day of plan.itinerary_days) {
    lines.push(`### Day ${day.day_number} (${day.date}) — ${day.theme}`);
    const allActs = [...day.morning, ...day.afternoon, ...day.evening];
    for (const act of allActs) {
      lines.push(
        `- **${act.time_slot} (${act.Suggested_time}) — ${act.title}** (${act.estimated_duration_hours || 2}h)`
      );
      lines.push(`  - *Details:* ${act.description}`);
      lines.push(`  - *Transport:* ${act.transport_mode} | *Cost:* ${act.cost_note}`);
      if (act.citations.length > 0) {
        const citStr = act.citations
          .map(
            (c) =>
              `${c.document_title} (Page ${c.page_number || 1}${
                c.section_heading ? `, ${c.section_heading}` : ''
              })`
          )
          .join('; ');
        lines.push(`  - *Supporting Evidence:* ${citStr}`);
      } else {
        lines.push(`  - *Verification Status:* ${act.verification_label}`);
      }
    }
    lines.push('');
  }

  lines.push('## Policy & Restriction Validation Results');
  for (const chk of plan.policy_checks) {
    lines.push(`- **[${chk.status}] ${chk.rule_checked}** (${chk.category})`);
    lines.push(`  - *Explanation:* ${chk.explanation}`);
    if (chk.supporting_document_title) {
      lines.push(
        `  - *Source:* ${chk.supporting_document_title} (${chk.page_or_section || 'Page 1'})`
      );
    }
    lines.push(`  - *Recommended Action:* ${chk.recommended_action}`);
  }
  lines.push('');

  lines.push('## Missing & Time-Sensitive Information Checklist');
  for (const miss of plan.missing_information) {
    lines.push(
      `- **[${miss.severity.toUpperCase()} | ${miss.status_label}] ${miss.title}**`
    );
    lines.push(`  - *Reason:* ${miss.reason}`);
    lines.push(`  - *Next Action:* ${miss.recommended_action}`);
  }
  lines.push('');

  lines.push('## Limitations & Disclaimers');
  for (const lim of plan.limitations_and_disclaimers) {
    lines.push(`- ${lim}`);
  }

  return lines.join('\n');
}

export function downloadMarkdownPlan(plan: FinalTripPlan): void {
  const md = formatPlanAsMarkdown(plan);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${plan.trip_id}-itinerary.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
