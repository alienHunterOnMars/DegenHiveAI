from multiprocessing import Process
import requests
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import os
import threading
import pandas as pd

from hivemind.CEO import CEO
from hivemind.departments.fundraise.workflow import fundraise_workflow
from hivemind.departments.community.workflow import community_workflow
from hivemind.departments.marketing.workflow import marketing_workflow
from hivemind.departments.tech.workflow import tech_workflow



async def bootstrap_hivemindAI():
    company = Team()
    company.hire([CEO, community_workflow, tech_workflow])
    return company


if __name__ == "__main__":
    bootstrap_hivemindAI()