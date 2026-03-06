//! API error type and HTTP response mapping.
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug)]
pub enum ApiError {
    BadRequest { message: String },
    Internal { message: String },
}

#[derive(Serialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
}

impl ApiError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest {
            message: message.into(),
        }
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message, code) = match self {
            ApiError::BadRequest { message } => (StatusCode::BAD_REQUEST, message, None),
            ApiError::Internal { message } => (
                StatusCode::INTERNAL_SERVER_ERROR,
                message,
                Some("internal".to_string()),
            ),
        };
        let body = ErrorBody {
            error: ErrorDetail { message, code },
        };
        (
            status,
            [("Content-Type", "application/json")],
            serde_json::to_string(&body).unwrap_or_else(|_| r#"{"error":{"message":"serialization failed"}}"#.to_string()),
        )
            .into_response()
    }
}
