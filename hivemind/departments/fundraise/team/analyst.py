"""
4. Financial Analyst & Pitch Deck Specialist
Responsibilities:

Financial Modeling: Create and maintain financial models that forecast revenue, user growth, and key performance indicators relevant to a crypto DEX and liquid staking protocol.
Pitch Materials: Develop high-quality pitch decks, investor presentations, and supporting documentation that tell a compelling financial story.
Data Analysis: Analyze market trends, competitive landscapes, and internal performance metrics to inform strategic decisions.
Due Diligence Support: Prepare detailed financial data and responses for investor due diligence processes.
Qualifications & Profile:

Experience: 3–5 years in financial analysis, investment banking, or similar roles; an MBA or CFA is a plus.
Industry Knowledge: Understanding of blockchain, DeFi, NFT economics, and crypto market dynamics.
Skills: Proficient in Excel, financial modeling tools, and data visualization software; strong analytical skills and attention to detail.
Attributes: A strategic thinker who can simplify complex financial data and communicate insights effectively to both technical and non-technical stakeholders.
"""

from hivemind.algorithm.templates.Role import Role

class Analyst(Role):
    name: str = "Fundraise/Analyst"
    profile: str = "Financial Analyst & Pitch Deck Specialist"
    goal: str = "Create and maintain financial models that forecast revenue, user growth, and key performance indicators relevant to a crypto DEX and liquid staking protocol."
    constraints: str = "make sure the financial model is accurate and realistic"


    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Financial Analyst & Pitch Deck Specialist AI"

        # Initialize actions specific to the Analyst role
        self.set_actions([])
        # Set events or actions the Analyst should watch or be aware of
        self._watch({})