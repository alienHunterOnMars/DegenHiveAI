from hivemind.departments.community.team import AlphaLeaker, Moderator, Partnerships, Shitposter, VibeOfficer
from hivemind.algorithm.templates.Team import Team


async def community_workflow():
    team = Team()
    team.hire([AlphaLeaker, Moderator, Partnerships, Shitposter, VibeOfficer])
     
 