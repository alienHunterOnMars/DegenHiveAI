"""
5. Marketing Analytics & Campaign Strategist AI
Role & Responsibilities:

Performance Tracking: Monitor the performance of all marketing campaigns across social media, blog posts, and media outreach.
Data Analysis: Use analytics tools to measure engagement, reach, conversion rates, and other key performance indicators.
Optimization: Provide insights and recommendations to optimize campaigns in real time.
Reporting: Create daily/weekly reports summarizing marketing performance and trends, and share these with the Marketing Lead and CEO.
Qualifications & Profile:

Experience: 3–5 years in digital marketing analytics or campaign management; strong background in data analysis.
Industry Knowledge: Familiarity with analytics tools (e.g., Google Analytics, social media dashboards) and metrics relevant to crypto/tech startups.
Skills: Data analysis, reporting, strategic thinking, and proficiency with data visualization.
Attributes: Analytical, detail-oriented, and proactive in identifying improvement opportunities.
"""

from hivemind.algorithm.templates.Role import Role

class Analyst(Role):
    name: str = "Marketing/Analyst"
    profile: str = "Marketing Analytics & Campaign Strategist"
    goal: str = "Monitor the performance of all marketing campaigns across social media, blog posts, and media outreach."
    constraints: str = "make sure the marketing content is engaging and brand-aligned"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Marketing Analytics & Campaign Strategist AI"

        # Initialize actions specific to the Analyst role
        self.set_actions([])
        # Set events or actions the Analyst should watch or be aware of
        self._watch({})
