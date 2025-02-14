"""
Role:
The Logger AI Agent acts as the central data collector and organizer for all technical requests. It monitors and records every tech-related input (bug reports, feature requests, tool needs, etc.) coming from other departments (e.g., Community, Fundraising, Marketing). This agent’s main responsibility is to build and maintain an up-to-date, well-categorized, and searchable log of requirements for the tech team.

Key Responsibilities:

Data Collection: Continuously scan channels (emails, chat logs, ticket systems) to gather tech requirements and issues.
Categorization: Automatically classify each request (e.g., bug, enhancement, new feature, tool integration) and tag them with relevant metadata such as priority, source, and description.
Prioritization: Assign preliminary priorities based on keywords, reported impact, and urgency, flagging critical issues for immediate attention.
Central Repository: Maintain a centralized backlog/ticketing system that is accessible to the Planner and other team leads.
Reporting: Generate daily or real-time summaries that detail the current task backlog and highlight high-priority items.
Skills & Attributes:

Natural Language Processing: Efficiently extract key details from varied input formats.
Attention to Detail: Ensure all requirements are logged accurately and with context.
Organizational Intelligence: Ability to categorize and tag tasks systematically.
Proactive Monitoring: Continuously scan and update logs to reflect real-time changes.
"""

from hivemind.algorithm.templates.Role import Role

class TechLogger(Role):
    name: str = "Tech/Logger"
    profile: str = "Logger"
    goal: str = "Tech Logger AI Agent"
    constraints: str = "make sure the financial model is accurate and realistic"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Tech Logger AI"

        # Initialize actions specific to the TechLogger role
        self.set_actions([])
        # Set events or actions the TechLogger should watch or be aware of
        self._watch({})