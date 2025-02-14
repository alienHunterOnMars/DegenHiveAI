"""
Planner AI Agent
Role:
The Planner AI Agent is responsible for processing the tasks logged by the Logger. It analyzes each requirement, prioritizes them based on business impact and urgency, and generates a detailed technical plan—including specifications, design choices, and code outlines—for each task. Essentially, the Planner converts logged needs into actionable development steps.

Key Responsibilities:

Task Analysis: Review each item from the Logger’s backlog and evaluate the underlying requirements.
Prioritization & Scheduling: Refine the initial priorities based on business context and technical feasibility, then schedule tasks in a logical order.
Technical Planning: For each task, produce comprehensive technical documentation that outlines necessary changes, architectural considerations, and, when applicable, code outlines or prototypes.
Implementation Roadmap: Create a step-by-step development roadmap for each task to guide the engineering work.
Feedback Loop: Provide status updates and detailed plans back to the Logger and higher management, ensuring transparency and enabling iterative improvements.
Skills & Attributes:

Technical Expertise: Deep knowledge of relevant programming languages, blockchain technology, and development best practices.
Analytical Thinking: Ability to break down complex requirements into manageable tasks.
Clear Communication: Produce human-like, detailed documentation that clearly explains technical solutions.
Agility: Work on tasks sequentially, ensuring one task is fully planned before moving on to the next.
"""

from hivemind.algorithm.templates.Role import Role

class Planner(Role):
    name: str = "Tech/Planner"
    profile: str = "Planner"
    goal: str = "Planner AI Agent"
    constraints: str = "make sure the financial model is accurate and realistic"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "Planner AI"

        # Initialize actions specific to the Planner role
        self.set_actions([])
        # Set events or actions the Planner should watch or be aware of
        self._watch({})