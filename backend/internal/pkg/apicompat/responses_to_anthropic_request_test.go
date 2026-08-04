package apicompat

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponsesToAnthropicRequestStructuredToolOutput(t *testing.T) {
	req := &ResponsesRequest{
		Model: "claude-opus-4",
		Input: json.RawMessage(`[
			{"type":"function_call","call_id":"call_read","name":"Read","arguments":"{}"},
			{"type":"function_call_output","call_id":"call_read","output":[
				{"type":"input_text","text":"screenshot"},
				{"type":"input_image","image_url":"data:image/png;base64,iVBOR"}
			]}
		]`),
	}

	converted, err := ResponsesToAnthropicRequest(req)
	require.NoError(t, err)
	require.Len(t, converted.Messages, 2)

	var resultBlocks []AnthropicContentBlock
	require.NoError(t, json.Unmarshal(converted.Messages[1].Content, &resultBlocks))
	require.Len(t, resultBlocks, 1)
	assert.Equal(t, "tool_result", resultBlocks[0].Type)

	var content []AnthropicContentBlock
	require.NoError(t, json.Unmarshal(resultBlocks[0].Content, &content))
	require.Len(t, content, 2)
	assert.Equal(t, "screenshot", content[0].Text)
	require.NotNil(t, content[1].Source)
	assert.Equal(t, "image/png", content[1].Source.MediaType)
	assert.Equal(t, "iVBOR", content[1].Source.Data)
}

func TestResponsesToAnthropicRequestRepairsToolPairing(t *testing.T) {
	req := &ResponsesRequest{
		Model: "claude-opus-4",
		Input: json.RawMessage(`[
			{"role":"user","content":"start"},
			{"type":"function_call","call_id":"answered","name":"search","arguments":"{}"},
			{"type":"function_call","call_id":"dangling","name":"search","arguments":"{}"},
			{"role":"user","content":"injected notice"},
			{"type":"function_call_output","call_id":"answered","output":"done"},
			{"type":"function_call_output","call_id":"orphan","output":"ignore"}
		]`),
	}

	converted, err := ResponsesToAnthropicRequest(req)
	require.NoError(t, err)
	require.Len(t, converted.Messages, 3)

	var toolUses []AnthropicContentBlock
	require.NoError(t, json.Unmarshal(converted.Messages[1].Content, &toolUses))
	require.Len(t, toolUses, 1)
	assert.Equal(t, "toolu_answered", toolUses[0].ID)

	var toolResults []AnthropicContentBlock
	require.NoError(t, json.Unmarshal(converted.Messages[2].Content, &toolResults))
	require.Len(t, toolResults, 2)
	assert.Equal(t, "toolu_answered", toolResults[0].ToolUseID)
	assert.Equal(t, "text", toolResults[1].Type)
	assert.Equal(t, "injected notice", toolResults[1].Text)
}
