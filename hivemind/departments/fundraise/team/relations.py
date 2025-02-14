"""
3. Investor Relations & Communications Specialist
Responsibilities:

Ongoing Relations: Manage ongoing communication with current and potential investors, ensuring they remain informed and engaged.
Content Creation: Prepare investor updates, newsletters, and reports that communicate progress, milestones, and strategic initiatives.
Feedback Loop: Serve as the point of contact for investor queries and feedback, escalating critical issues to senior leadership.
Documentation: Maintain clear records of all investor interactions and ensure timely follow-ups.
Qualifications & Profile:

Experience: 3–5 years in investor relations, corporate communications, or PR, ideally with exposure to the crypto/DeFi space.
Industry Knowledge: Solid understanding of financial communications in a startup/crypto environment.
Skills: Strong writing and editing skills, detail-oriented, with the ability to translate complex technical and financial information into clear, compelling narratives.
Attributes: A proactive communicator who can build trust and credibility with a diverse investor base.
"""

from hivemind.algorithm.templates.Role import Role

class Relations(Role):
    name: str = "Fundraise/Relations"
    profile: str = "Investor Relations & Communications Specialist"
    goal: str = "Manage ongoing communication with current and potential investors, ensuring they remain informed and engaged."
    constraints: str = "make sure the financial model is accurate and realistic"


    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Investor Relations & Communications Specialist AI"

        # Initialize actions specific to the Relations role
        self.set_actions([])
        # Set events or actions the Relations should watch or be aware of
        self._watch({})