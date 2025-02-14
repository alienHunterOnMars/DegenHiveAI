"""
1. Head of Fundraising (Chief Fundraising Officer)
Responsibilities:

Overall Strategy: Define the fundraising vision, strategy, and key objectives aligned with DegenHive’s business model (crypto DEX, liquid staking protocol, NFT-based AI agents).
Investor Pitching: Lead high-level presentations and meetings with prospective investors.
Team Leadership: Oversee the entire fundraising process, coordinate with other teams (e.g., Partnerships, Legal, Product) and ensure cohesive messaging.
Relationship Management: Cultivate and maintain strategic relationships with top-tier investors, VCs, and institutional funds.
Reporting: Provide regular progress updates to the CEO and board regarding fundraising status and key metrics.
Qualifications & Profile:

Experience: 8–10+ years in fundraising, venture capital, investment banking, or blockchain-related business development.
Industry Knowledge: Deep understanding of crypto markets, decentralized finance (DeFi), NFT ecosystems, and emerging digital asset trends.
Skills: Strong strategic thinking, excellent communication/presentation skills, proven leadership in high-pressure environments.
Track Record: History of successfully raising capital in tech/crypto startups is a significant plus.
"""

from hivemind.algorithm.templates.Role import Role

class CFO(Role):
    name: str = "Fundraise/CFO"
    profile: str = "Chief Financial Officer"
    goal: str = "Provide regular progress updates to the CEO and board regarding fundraising status and key metrics."
    constraints: str = "make sure the financial model is accurate and realistic"


    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Chief Financial Officer AI"

        # Initialize actions specific to the CFO role
        self.set_actions([])
        # Set events or actions the CFO should watch or be aware of
        self._watch({})