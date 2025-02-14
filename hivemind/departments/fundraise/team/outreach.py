"""2. Investor Outreach Manager
Responsibilities:

Prospecting: Identify and research potential investors (VCs, angel investors, crypto funds, strategic partners) who align with DegenHive’s vision.
Initial Engagement: Develop tailored outreach strategies, including cold emailing, networking on crypto events, and leveraging online platforms.
Pipeline Management: Maintain an up-to-date CRM (or similar system) tracking investor contacts, follow-ups, and meeting schedules.
Collaboration: Work closely with the Head of Fundraising to refine messaging and ensure that outreach efforts support overall fundraising goals.
Qualifications & Profile:

Experience: 3–5 years in business development or investor relations, preferably within crypto/fintech.
Industry Knowledge: Familiarity with crypto investment trends and a robust network in the blockchain community.
Skills: Excellent written and verbal communication, persuasive negotiation skills, and strong organizational abilities.
Attributes: Self-motivated, detail-oriented, and comfortable working in a fast-paced, startup environment.
"""

from hivemind.algorithm.templates.Role import Role

class Outreach(Role):
    name: str = "Fundraise/Outreach"
    profile: str = "Investor Outreach Manager"
    goal: str = "Identify and research potential investors (VCs, angel investors, crypto funds, strategic partners) who align with DegenHive’s vision."
    constraints: str = "make sure the financial model is accurate and realistic"


    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Investor Outreach Manager AI"

        # Initialize actions specific to the Outreach role
        self.set_actions([])
        # Set events or actions the Outreach should watch or be aware of
        self._watch({})