"""Tests for parse_portfolio.py schema validation.
Run: python3 -m pytest test/test_parse_portfolio.py -v
"""
import sys
import os
import pytest

# Add project root to path so we can import parse_portfolio
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from parse_portfolio import validate_llm_result


# ── Valid responses ─────────────────────────────────────────────────────────────

class TestValidResponses:
    def test_complete_valid_response(self):
        result = validate_llm_result({
            "portfolio_value": "$12,345.67",
            "total_profit_loss": "+$1,234.56",
            "total_profit_loss_percent": "+11.1%",
            "extraction_confidence": "high",
            "positions": [
                {"symbol": "AAPL", "name": "Apple Inc", "units": "5.5"},
                {"symbol": "TSLA", "name": "Tesla Inc", "units": "3.0"},
            ]
        })
        assert len(result["positions"]) == 2
        assert result["positions"][0]["symbol"] == "AAPL"
        assert result["extraction_confidence"] == "high"

    def test_minimal_valid_response(self):
        result = validate_llm_result({"positions": [{"symbol": "BTC"}]})
        assert len(result["positions"]) == 1
        assert result["positions"][0]["symbol"] == "BTC"

    def test_empty_positions_list(self):
        result = validate_llm_result({"positions": []})
        assert result["positions"] == []

    def test_no_positions_key(self):
        result = validate_llm_result({"portfolio_value": "$1000"})
        assert result["positions"] == []


# ── Position filtering ──────────────────────────────────────────────────────────

class TestPositionFiltering:
    def test_filters_out_non_dict_positions(self):
        result = validate_llm_result({
            "positions": [
                {"symbol": "AAPL", "name": "Apple"},
                "not a dict",
                42,
                {"symbol": "TSLA", "name": "Tesla"},
            ]
        })
        assert len(result["positions"]) == 2
        assert result["positions"][0]["symbol"] == "AAPL"
        assert result["positions"][1]["symbol"] == "TSLA"

    def test_filters_out_positions_without_symbol(self):
        result = validate_llm_result({
            "positions": [
                {"symbol": "AAPL", "name": "Apple"},
                {"name": "No Symbol Here"},
                {"symbol": "", "name": "Empty Symbol"},
                {"symbol": None, "name": "Null Symbol"},
                {"symbol": "TSLA"},
            ]
        })
        assert len(result["positions"]) == 2
        symbols = [p["symbol"] for p in result["positions"]]
        assert symbols == ["AAPL", "TSLA"]


# ── Type coercion ───────────────────────────────────────────────────────────────

class TestTypeCoercion:
    def test_coerces_numeric_string_fields_to_string(self):
        result = validate_llm_result({
            "portfolio_value": 12345.67,
            "total_profit_loss": -500,
            "total_profit_loss_percent": 11.1,
            "extraction_confidence": 0.95,
            "positions": [{"symbol": "AAPL"}]
        })
        assert result["portfolio_value"] == "12345.67"
        assert result["total_profit_loss"] == "-500"
        assert result["total_profit_loss_percent"] == "11.1"
        assert result["extraction_confidence"] == "0.95"

    def test_leaves_null_fields_as_null(self):
        result = validate_llm_result({
            "portfolio_value": None,
            "total_profit_loss": None,
            "extraction_confidence": None,
            "positions": []
        })
        assert result["portfolio_value"] is None
        assert result["total_profit_loss"] is None
        assert result["extraction_confidence"] is None

    def test_leaves_string_fields_unchanged(self):
        result = validate_llm_result({
            "portfolio_value": "$12,345.67",
            "total_profit_loss": "+$1,234.56",
            "positions": []
        })
        assert result["portfolio_value"] == "$12,345.67"
        assert result["total_profit_loss"] == "+$1,234.56"

    def test_coerces_notes_field(self):
        result = validate_llm_result({
            "notes": 123,
            "positions": []
        })
        assert result["notes"] == "123"

    def test_coerces_available_cash(self):
        result = validate_llm_result({
            "available_cash": 5000,
            "positions": []
        })
        assert result["available_cash"] == "5000"


# ── Error cases ─────────────────────────────────────────────────────────────────

class TestErrorCases:
    def test_rejects_non_dict_response(self):
        with pytest.raises(ValueError, match="not a JSON object"):
            validate_llm_result("just a string")

    def test_rejects_list_response(self):
        with pytest.raises(ValueError, match="not a JSON object"):
            validate_llm_result([{"symbol": "AAPL"}])

    def test_rejects_non_list_positions(self):
        with pytest.raises(ValueError, match="must be a list"):
            validate_llm_result({"positions": "not a list"})

    def test_rejects_positions_as_dict(self):
        with pytest.raises(ValueError, match="must be a list"):
            validate_llm_result({"positions": {"AAPL": {"name": "Apple"}}})

    def test_rejects_integer_response(self):
        with pytest.raises(ValueError, match="not a JSON object"):
            validate_llm_result(42)

    def test_rejects_none_response(self):
        with pytest.raises((ValueError, AttributeError)):
            validate_llm_result(None)


# ── Real-world LLM response patterns ───────────────────────────────────────────

class TestRealWorldResponses:
    def test_ollama_style_response(self):
        """Ollama sometimes returns extra fields or different types."""
        result = validate_llm_result({
            "portfolio_value": "$10,500.00",
            "total_profit_loss": "+$500.00",
            "total_profit_loss_percent": "+5%",
            "extraction_confidence": "high",
            "notes": "Extracted 3 positions from page data",
            "positions": [
                {"symbol": "AAPL", "name": "Apple Inc", "units": "5", "profit_loss": "+$50"},
                {"symbol": "TSLA", "name": "Tesla", "units": "2", "profit_loss": "-$30"},
                {"symbol": "BTC", "name": "Bitcoin", "units": "0.5", "profit_loss": "+$480"},
            ],
            "raw_text_length": 5000,  # extra field from LLM
        })
        assert len(result["positions"]) == 3
        assert result["extraction_confidence"] == "high"

    def test_openai_json_mode_response(self):
        """OpenAI with json_object mode returns clean JSON."""
        result = validate_llm_result({
            "portfolio_value": "€11,227.65",
            "total_profit_loss": "+€696.52",
            "total_profit_loss_percent": "+6.6%",
            "positions": [
                {"symbol": "HLIO", "name": "Helios Technologies Inc", "units": "9.25926",
                 "avg_price": "€54.00", "current_price": "€71.99", "profit_loss": "+€140.58",
                 "profit_loss_percent": "+28.12%"},
                {"symbol": "ASML.NV", "name": "ASML Holding NV", "units": "0.459259",
                 "profit_loss": "+€126.80"},
            ],
            "extraction_confidence": "high",
            "notes": None
        })
        assert len(result["positions"]) == 2
        assert result["portfolio_value"] == "€11,227.65"
        assert result["notes"] is None

    def test_anthropic_messy_response(self):
        """Anthropic sometimes includes partial or messy positions."""
        result = validate_llm_result({
            "portfolio_value": "€11,227.65",
            "positions": [
                {"symbol": "HLIO", "name": "Helios", "profit_loss": "+€140.58"},
                {},  # empty dict - no symbol
                {"name": "Unknown"},  # no symbol
                {"symbol": "VRT", "profit_loss": "-€10.54"},
            ],
            "extraction_confidence": "medium"
        })
        # Should filter down to 2 valid positions
        assert len(result["positions"]) == 2
        assert result["positions"][0]["symbol"] == "HLIO"
        assert result["positions"][1]["symbol"] == "VRT"

    def test_response_matching_sample_portfolio(self):
        """Test with all 21 positions from the user's real portfolio."""
        symbols = [
            "HLIO", "ASML.NV", "XLE", "CEMS.DE", "ITA", "EUNN.DE", "IQQS.DE",
            "COP", "IEUR", "BRNT.L", "WDEF.L", "2B76.DE", "FLR.US", "KGX.DE",
            "NEE", "VRT", "QCOM", "APP", "LEN", "AVGO", "ABT"
        ]
        positions = [{"symbol": s, "name": f"Company {s}"} for s in symbols]
        result = validate_llm_result({
            "portfolio_value": "€11,227.65",
            "total_profit_loss": "+€696.52",
            "positions": positions,
            "extraction_confidence": "high"
        })
        assert len(result["positions"]) == 21
        result_symbols = [p["symbol"] for p in result["positions"]]
        assert result_symbols == symbols


# ── Preserves extra fields ──────────────────────────────────────────────────────

class TestPreservesExtraFields:
    def test_preserves_unknown_top_level_fields(self):
        result = validate_llm_result({
            "positions": [{"symbol": "BTC"}],
            "custom_field": "some value",
            "metadata": {"source": "test"}
        })
        assert result["custom_field"] == "some value"
        assert result["metadata"]["source"] == "test"

    def test_preserves_extra_position_fields(self):
        result = validate_llm_result({
            "positions": [
                {"symbol": "AAPL", "name": "Apple", "invested": "$825", "custom": True}
            ]
        })
        assert result["positions"][0]["invested"] == "$825"
        assert result["positions"][0]["custom"] is True
