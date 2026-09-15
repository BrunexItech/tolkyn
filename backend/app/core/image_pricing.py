"""Estimated cost per Content Studio image generation.

Unlike Veo (see core/video_models.py), OpenAI doesn't give us a way to read
back an exact cost per call: the chat composer runs on the Responses API
(image_responses.run_turn), and its `image_generation` tool call carries no
usage/token breakdown in the API response — confirmed by reading the
installed SDK's own type definitions, not assumed. OpenAI also doesn't
publish a tokens-per-image table for gpt-image-2.5 the way older image
models had one.

So this is a single flat estimate, calibrated the only reliable way
available: watching the real OpenAI credit balance drop across an actual
generation ($4.64 -> $4.50 on 2026-09-14, chat mode, "high" quality, with
the prompt-revising helper in the loop). It is NOT exact per job — quality
tier and prompt length shift the real number — and gpt-image-2.5-sunburst
and -flare are priced identically per OpenAI's token rates, so one constant
covers both. Recalibrate by generating a few more images and checking
platform.openai.com/usage over the same window, then update this value.
"""

IMAGE_COST_ESTIMATE_USD = 0.14
