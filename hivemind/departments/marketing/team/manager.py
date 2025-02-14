

from hivemind.algorithm.templates.Role import Role


class Manager(Role):
    """
    2. Social Media Manager AI
    Role & Responsibilities:

    Account Management: Curate and manage daily posts on Twitter and Farcaster for the official DegenHive account, HiveMindAI, and the founder’s account.
    Engagement: Interact with followers, reply to comments/mentions, and maintain an active, friendly presence.
    Scheduling & Consistency: Create content calendars, schedule posts, and ensure timely updates that align with marketing campaigns.
    Trend Monitoring: Track social media trends and crypto community sentiment to adjust content in real-time.
    Qualifications & Profile:

    Experience: 3–5 years in social media management; familiarity with crypto and tech-savvy audiences.
    Industry Knowledge: Understanding of crypto culture and emerging social trends (e.g., meme culture, Web3 topics).
    Skills: Content curation, community engagement, scheduling tools, social analytics.
    Attributes: Energetic, adaptable, and in tune with digital trends.
    """
    
    name: str = "Marketing/Manager"
    profile: str = "Social Media Manager"
    goal: str = "Curate and manage daily posts on Twitter and Farcaster for the official DegenHive account, HiveMindAI, and the founder’s account."
    constraints: str = "make sure the marketing content is engaging and brand-aligned"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Social Media Manager AI"

        # Initialize actions specific to the Manager role
        self.set_actions([])
        # Set events or actions the Manager should watch or be aware of
        self._watch({})
