
from hivemind.departments.tech.team import Planner, TechLogger
from hivemind.algorithm.templates.Team import Team


async def tech_workflow():
    team = Team()
    team.hire([Planner, TechLogger])
    return team