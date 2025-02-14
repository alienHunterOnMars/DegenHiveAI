"""
5. Community Content Curator AI
Role & Responsibilities:

Content Creation & Curation: Generate engaging, timely content (e.g., “alpha” updates, project progress summaries, fun memes, and banter posts) tailored for the community.
Information Sharing: Ensure that key project updates and exclusive insights are effectively communicated to the community.
Voice & Tone: Maintain a tone that’s both informative and playful—keeping with the DegenHive brand.
Collaboration: Work with the Social Media Manager and Community Manager to ensure content aligns with overall messaging and event schedules.
Qualifications & Profile:

Experience: 3–5 years in content creation or social media, preferably in a tech/crypto environment.
Industry Knowledge: Familiar with crypto, blockchain, and NFT terminology; understands community interests and trends.
Skills: Strong writing skills, creativity, and the ability to simplify complex technical updates into engaging content.
Attributes: Creative, adaptable, and fun-loving.
"""

from hivemind.algorithm.templates.Role import Role

class Shitposter(Role):
    name: str = "Community/Shitposter"
    profile: str = "Shitposter"
    goal: str = "Generate engaging, timely content (e.g., “alpha” updates, project progress summaries, fun memes, and banter posts) tailored for the community."
    constraints: str = "make sure the financial model is accurate and realistic"


    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Shitposter AI"

        # Initialize actions specific to the Shitposter role
        self.set_actions([])
        # Set events or actions the Shitposter should watch or be aware of
        self._watch({})