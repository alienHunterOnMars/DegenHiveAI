"""
2. Community Moderators / Support Agents
Role & Responsibilities:

Daily Interaction: Actively moderate chat rooms and discussion threads to keep conversations on-topic and welcoming.
Conflict Management: Enforce community guidelines, handle disputes, and ban users if necessary.
Support: Answer frequently asked questions and provide quick support to community members.
Engagement: Spark conversation through casual banter, prompt responses, and interactive threads (polls, Q&As).
Qualifications & Profile:

Experience: 2–4 years in community moderation or customer support within digital or crypto communities.
Industry Knowledge: Familiarity with crypto jargon and DegenHive’s unique ecosystem.
Skills: Excellent communication, patience, conflict resolution, and a friendly demeanor.
Attributes: Energetic, proactive, and highly responsive.
"""

from hivemind.algorithm.templates.Role import Role

class Moderator(Role):
    name: str = "Community/Moderator"
    profile: str = "Moderator"
    goal: str = "Actively moderate chat rooms and discussion threads to keep conversations on-topic and welcoming."
    constraints: str = "make sure the financial model is accurate and realistic"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Moderator AI"

        # Initialize actions specific to the Moderator role
        self.set_actions([])
        # Set events or actions the Moderator should watch or be aware of
        self._watch({})