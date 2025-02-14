import asyncio
from hivemind.departments.marketing.team import (
    CMO,
    Creator,
    Manager,
    Outreach,
    Analyst,
)
from hivemind.algorithm.templates.Team import Team

PURPOSE = "To increase the visibility of DegenHive and HiveMindAI on social media platforms, build a strong online presence, and engage with the crypto community."

async def marketing_workflow():
    marketing_team = Team()

    marketing_team.hire([CMO, Creator, Manager, Outreach, Analyst])

    marketing_team.run_project(idea=PURPOSE)

