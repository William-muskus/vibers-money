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
    ServiceUnavailable { message: String },
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
    #[serde(skip_serializing_if = "Option::is_none")]
    r#type: Option<String>,
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
    pub fn service_unavailable(message: impl Into<String>) -> Self {
        Self::ServiceUnavailable {
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message, code, type_) = match self {
            ApiError::BadRequest { message } => (StatusCode::BAD_REQUEST, message, None, None),
            ApiError::Internal { message } => (
                StatusCode::INTERNAL_SERVER_ERROR,
                message,
                Some("internal".to_string()),
                Some("server_error".to_string()),
            ),
            ApiError::ServiceUnavailable { message } => (
                StatusCode::SERVICE_UNAVAILABLE,
                message,
                None,
                Some("server_error".to_string()),
            ),
        };
        let body = ErrorBody {
            error: ErrorDetail {
                message,
                code,
                r#type: type_,
            },
        };
        (
            status,
            [("Content-Type", "application/json")],
            serde_json::to_string(&body).unwrap_or_else(|_| r#"{"error":{"message":"serialization failed"}}"#.to_string()),
        )
            .into_response()
    }
}
