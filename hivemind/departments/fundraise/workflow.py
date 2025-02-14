from hivemind.algorithm.templates.Team import Team
from hivemind.departments.fundraise.team import CFO, Outreach, Relations, Analyst


def fundraise_workflow():
    team = Team()
    team.hire([CFO, Outreach, Relations, Analyst])
    team.run()