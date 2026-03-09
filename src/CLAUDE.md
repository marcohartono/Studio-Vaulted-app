Studio Vaulted — System Overview
Overview

Studio Vaulted is a desktop application designed to help music producers organize, explore, and develop unfinished ideas and project files. It functions similarly to Notion for music production, providing a structured environment to manage audio projects, preview tracks, track versions, and attach creative notes.

The application is built primarily for Ableton Live users on macOS. The system scans a user’s project directories, indexes track metadata, and allows producers to organize projects into folders, groups, and tags. It also supports quick audio preview and version history.

The goal of Studio Vaulted is to reduce friction between creative ideas and organization, allowing producers to quickly revisit unfinished projects, categorize them, and continue building on past work.

Target Users

Primary users include:

Electronic music producers

DJs

Ableton Live users

Producers with large libraries of unfinished project files

Common problems the app solves:

Hundreds of unfinished .als project files

No easy way to preview projects

Difficulty organizing ideas by BPM, genre, mood, or project

Losing track of different versions of tracks

Platform & Technical Stack

Studio Vaulted is a desktop application built with the following stack.

Frontend

Next.js

React

Electron renderer process

Backend

Electron main process

Node.js

Database

SQLite

File System

Direct access to local folders containing Ableton projects

Supported DAWs

Ableton Live (.als files)

Current Limitations

macOS only

No Logic Pro support

No direct Ableton API integration

Core System Concept

Studio Vaulted treats music projects as structured data objects.

Each project is indexed and stored in a database with metadata, allowing fast filtering, grouping, and searching.

Conceptually:

Project

Name

BPM

File path

Versions

Tags

Notes

Folder / Project grouping

Audio preview

The system scans a directory containing .als files and builds a structured database representation.

Major Features
1. Project Library Scanner

The application scans user-selected folders to detect Ableton .als files.

Functionality includes:

Recursively scanning project directories

Identifying .als files

Storing metadata in SQLite

Avoiding duplicate indexing

Detecting updated versions

The folder path is stored in application settings so users do not need to reselect it every session.

2. Project Version History

Ableton creates a new .als file each time a project is saved.

Example:

track a.als
track a [2025-11-27 015200].als
track a [2025-11-27 023500].als

Studio Vaulted groups these automatically.

UI Behavior

Project list shows only:

Track A

Opening the project reveals:

Versions
- Nov 27 01:52
- Nov 27 02:35
- Current

This prevents clutter while preserving version history.

3. Audio Preview System

Users can preview tracks without opening Ableton.

The system plays audio previews extracted from project folders.

Possible audio sources include:

Ableton rendered previews

Exported audio

Project bounce files

Example workflow:

User clicks track → Preview plays instantly

This allows producers to quickly browse ideas.

4. BPM Tagging

Each project can be associated with a BPM value.

Currently BPM is:

manually entered

stored in the database

Future versions may automatically extract BPM from .als files.

BPM is used for:

filtering

grouping

organization

Example BPM groups:

120–124 BPM
125–128 BPM
140+ BPM
5. Folder Organization

Users can create custom folders inside Studio Vaulted.

Example folders:

Ideas
Finished
DJ Tools
Collabs
Archive

This system is separate from the operating system file structure.

Folders act as organizational metadata, not physical directories.

6. Project Groups (Creative Categories)

Users can organize tracks by creative categories.

Examples include:

UK Garage
Bass House
Dark Club
Summer Tracks
Vocal Ideas

A project can belong to multiple groups.

This system works similarly to tags or collections.

7. Notes System

Each project can have a creative notes board attached.

The notes system allows producers to document ideas, references, or reminders.

Supported formats include:

Text Notes

formatted text

bullet points

headings

colors

alignment

Images

reference artwork

screenshots

Voice Recordings (planned feature)

melody ideas

spoken notes

Notes appear as a popup panel linked to the track.

Example:

Track: Summer Garage

Notes:
- Add female vocal
- Try Kettama-style bass
- Reference: MPH groove
8. Project Templates

Users can start new tracks from Ableton templates.

Workflow:

Start New Project
   ↓
Select Template
   ↓
Launch Ableton with Template

Studio Vaulted scans the user’s Ableton template folder and displays template names in the interface.

This reduces friction when starting new ideas.

9. Settings System

A settings page allows users to configure:

Project folder location

Template folder location

Audio preview behavior

Settings persist across sessions.

Data Model (Simplified)
Projects
id
name
file_path
bpm
created_at
updated_at
Versions
id
project_id
file_path
timestamp
Folders
id
name
ProjectFolders
project_id
folder_id
Tags
id
name
ProjectTags
project_id
tag_id
Notes
id
project_id
content
created_at
Design Philosophy

Studio Vaulted is designed around three principles.

1. Reduce Creative Friction

Users should be able to quickly revisit ideas without opening their DAW.

2. Treat Music Projects Like Knowledge Objects

Similar to how Notion treats notes and documents.

3. Make Unfinished Ideas Valuable

Most producers abandon hundreds of tracks. Studio Vaulted helps resurface them.

Current Limitations

Studio Vaulted currently:

only supports Ableton .als files

does not integrate with a DAW API

cannot modify projects directly

relies on filesystem scanning

Potential Future Improvements

Possible future features include:

BPM extraction from project files

waveform previews

AI tagging of projects

similarity search between tracks

collaboration tools

Summary

Studio Vaulted is a music project management system for producers that combines:

project organization

version tracking

audio preview

metadata tagging

creative notes

The system converts a messy folder of Ableton projects into a structured creative workspace for producers to manage and develop their ideas.

If you want, I can also give you a much better version specifically optimized for AI coding tools (Codex / Cursor / Devin / agents) that dramatically improves how the model understands the system and writes code for it.