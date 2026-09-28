from backend.app.services.agent_run_service import AgentRunService, _build_degraded_response


def test_snapshot_and_synthetic_modes_are_publicly_labelled_demo():
    assert AgentRunService(data_mode="SNAPSHOT")._response_data_mode() == "DEMO"
    assert AgentRunService(data_mode="SYNTHETIC")._response_data_mode() == "DEMO"


def test_unimplemented_hybrid_mode_is_not_labelled_as_live():
    assert AgentRunService(data_mode="HYBRID")._response_data_mode() == "UNAVAILABLE"


def test_degraded_chat_response_exposes_unavailable_data_mode():
    response = _build_degraded_response("run-test", "conversation-test", RuntimeError("offline"))

    assert response.recommendation.status.value == "UNKNOWN"
    assert response.data_mode == "UNAVAILABLE"
