// Shared between the public form (src/interfaces/feedback/FeedbackForm.jsx)
// and the server-side PDF/email generator (api/_lib/feedbackPdf.js) so the
// question wording and the rendered submission can never drift apart.

export const NURSERY_OPTIONS = ['Finnly Preschool', 'La Garderie', 'Demo']

export const FEEDBACK_SECTIONS = [
  {
    title: 'About You',
    fields: [
      {
        key: 'role',
        label: 'What is your role?',
        type: 'radio',
        options: ['Administration', 'Reception / Front Desk', 'Security', 'Nursery Staff', 'Management', 'Other'],
        other: true,
      },
      {
        key: 'usage_frequency',
        label: 'How often did you use the system?',
        type: 'radio',
        options: ['Multiple times a day', 'Daily', 'A few times a week', 'Occasionally'],
      },
    ],
  },
  {
    title: 'Overall Experience',
    fields: [
      {
        key: 'overall_satisfaction',
        label: 'Overall, how satisfied are you with the system?',
        type: 'scale5',
        low: 'Very Dissatisfied',
        high: 'Very Satisfied',
      },
      {
        key: 'ease_of_use',
        label: 'How easy was the system to learn and use?',
        type: 'radio',
        options: ['Very Difficult', 'Difficult', 'Neutral', 'Easy', 'Very Easy'],
      },
      {
        key: 'workflow_fit',
        label: 'How well does the system fit into your current dismissal workflow?',
        type: 'radio',
        options: ['Not at all', 'Slightly', 'Moderately', 'Very well', 'Extremely well'],
      },
    ],
  },
  {
    title: 'Workflow & Efficiency',
    fields: [
      {
        key: 'improved_areas',
        label: 'Which areas did the system improve?',
        type: 'checkbox',
        options: [
          'Staff coordination',
          'Knowing when parents arrive',
          'Organizing dismissal',
          'Reducing confusion',
          'Reducing waiting time',
          'Preparing children',
          'Managing busy periods',
          'Other',
        ],
        other: true,
      },
      {
        key: 'workload_change',
        label: 'Did the system reduce the workload during dismissal?',
        type: 'radio',
        options: ['Significantly', 'Somewhat', 'No Difference', 'Increased Workload', 'Not Sure'],
      },
      {
        key: 'unnecessary_steps',
        label: 'Were there any steps that felt unnecessary or slowed down the process?',
        type: 'radio',
        options: ['Yes', 'No'],
        explainOn: 'Yes',
        explainKey: 'unnecessary_steps_explain',
      },
    ],
  },
  {
    title: 'Reliability',
    fields: [
      {
        key: 'reliability_rating',
        label: 'How reliable was the system during the pilot?',
        type: 'scale5',
        low: 'Very Unreliable',
        high: 'Very Reliable',
      },
      {
        key: 'problem_frequency',
        label: 'Did you experience any technical problems?',
        type: 'radio',
        options: ['Never', 'Rarely', 'Sometimes', 'Frequently'],
      },
      {
        key: 'problem_types',
        label: 'What problems did you experience?',
        type: 'checkbox',
        options: [
          'Slow loading',
          'Freezing / crashes',
          'Connectivity issues',
          'Delayed updates',
          'Incorrect information',
          'Login / access issues',
          'Other',
          'No problems',
        ],
        other: true,
      },
      {
        key: 'reverted_to_manual',
        label: 'Did you ever have to return to the old/manual process because of the system?',
        type: 'radio',
        options: ['Never', 'Once', 'A few times', 'Frequently'],
        explainOn: ['Once', 'A few times', 'Frequently'],
        explainKey: 'reverted_to_manual_explain',
      },
    ],
  },
  {
    title: 'Notifications & Installation',
    fields: [
      {
        key: 'notification_reliability',
        label: 'Were you notified reliably when a pickup request or status changed?',
        type: 'radio',
        options: ['Always', 'Usually', 'Sometimes', 'Rarely', 'Never', 'Not applicable to my role'],
      },
      {
        key: 'install_experience',
        label: 'How was your experience installing the app on your phone?',
        type: 'radio',
        options: ['Very Easy', 'Easy', 'Neutral', 'Difficult', 'Very Difficult', "Didn't need to install"],
      },
    ],
  },
  {
    title: 'Staff & Parents',
    fields: [
      {
        key: 'staff_adoption_ease',
        label: 'How easy was it for staff to adopt the system?',
        type: 'scale5',
        low: 'Very Difficult',
        high: 'Very Easy',
      },
      {
        key: 'staff_stress_effect',
        label: 'Did the system affect staff stress during dismissal?',
        type: 'radio',
        options: ['Significantly Increased', 'Slightly Increased', 'No Difference', 'Slightly Reduced', 'Significantly Reduced'],
      },
      {
        key: 'parent_experience',
        label: "Based on the feedback you received, how would you rate the parents' experience?",
        type: 'radio',
        options: ['1 — Very Negative', '2', '3', '4', '5 — Very Positive', 'We did not receive enough feedback'],
      },
      {
        key: 'parent_feedback_common',
        label: 'What was the most common feedback from parents?',
        type: 'text',
        optional: true,
      },
    ],
  },
  {
    title: 'Timer & Settings',
    fields: [
      {
        key: 'timer_length_feedback',
        label: 'Did the countdown/timer length feel right for your nursery?',
        type: 'radio',
        options: ['Too short', 'About right', 'Too long', 'Not sure'],
      },
    ],
  },
  {
    title: 'Improvements',
    fields: [
      { key: 'biggest_problem', label: 'What was the biggest problem you experienced with the system?', type: 'text' },
      { key: 'most_important_feature', label: 'What feature would make the system more useful for your nursery?', type: 'text' },
      { key: 'one_change', label: 'If you could change only ONE thing about the system, what would it be?', type: 'text' },
    ],
  },
  {
    title: 'Overall & Future Use',
    fields: [
      {
        key: 'adds_real_value',
        label: 'Do you believe the system adds real value to the nursery?',
        type: 'radio',
        options: ['Definitely Not', 'Probably Not', 'Neutral', 'Probably Yes', 'Definitely Yes'],
      },
      {
        key: 'continue_using',
        label: 'Would you prefer to continue using the Smart Dismissal System?',
        type: 'radio',
        options: ['Definitely Not', 'Probably Not', 'Not Sure', 'Probably Yes', 'Definitely Yes'],
      },
      {
        key: 'confidence_long_term',
        label: 'What would make you feel confident continuing to use the system long-term?',
        type: 'text',
        optional: true,
      },
      { key: 'other_feedback', label: 'Any other feedback or suggestions?', type: 'text', optional: true },
    ],
  },
]
