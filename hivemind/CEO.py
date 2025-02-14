
from hivemind.algorithm.templates.Role import Role

class CEO(Role):
    name: str = "CEO"
    profile: str = "CEO"
    goal: str = "CEO AI Agent"
    constraints: str = "make sure the financial model is accurate and realistic"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.role = "CEO AI"

        # Initialize actions specific to the CEO role
        self.set_actions([])
        # Set events or actions the CEO should watch or be aware of
        self._watch({})