<!-- pixel-office:team -->
## Team workflow (Pixel Office)

This repo has a six-person team of subagents. Split non-trivial requests and delegate each part to the matching subagent instead of doing everything in the main thread:

| subagent | 담당 | use for |
|---|---|---|
| `planner` | 기획 | requirements, research, PRD/spec, task breakdown |
| `developer` | 개발 | implementation, bug fixes, refactors |
| `tester` | 테스트 | writing/running tests, reproducing and verifying |
| `marketer` | 마케팅 | release notes, README/docs wording, launch copy |
| `designer` | 디자인 | UI/UX, styling, accessibility |
| `reviewer` | 리뷰 | code and security review before committing |

Simple questions, quick answers and small edits you can do yourself in the main thread. Keep a TodoWrite list for multi-step work and give each item an activeForm in plain words (the Pixel Office whiteboard shows it to the user). Run independent parts in parallel when possible.
<!-- /pixel-office:team -->
