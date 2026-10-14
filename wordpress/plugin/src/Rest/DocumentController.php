<?php
/**
 * WordPress REST transport for working documents.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

\defined( 'ABSPATH' ) || exit;

/** Registers only layout and locale-content working stream routes. */
final class DocumentController {
	/**
	 * Create a document controller.
	 *
	 * @param DocumentRequest $documents Request policy.
	 */
	public function __construct( private DocumentRequest $documents ) {}

	/** Register routes on rest_api_init. */
	public static function register(): void {
		global $wpdb;
		$controller = new self( new DocumentRequest( new StreamStore( new WpdbDatabase( $wpdb ) ), new WordPressPostAccess() ) );
		foreach ( [
			'/documents/(?P<post_id>\d+)/layout' => false,
			'/documents/(?P<post_id>\d+)/content/(?P<locale>[A-Za-z_]+)' => true,
		] as $route => $has_locale ) {
			$args = [
				'post_id' => [
					'type'              => 'integer',
					'required'          => true,
					'validate_callback' => [ self::class, 'validate_post_id' ],
				],
			];
			if ( $has_locale ) {
				$args['locale'] = [
					'type'              => 'string',
					'required'          => true,
					'validate_callback' => [ self::class, 'validate_locale' ],
				];
			}
			\register_rest_route(
				'blixis/v1',
				$route,
				[
					[
						'methods'             => 'GET',
						'callback'            => [ $controller, 'get' ],
						'permission_callback' => [ $controller, 'permission' ],
						'args'                => $args,
					],
					[
						'methods'             => 'PUT',
						'callback'            => [ $controller, 'put' ],
						'permission_callback' => [ $controller, 'permission' ],
						'args'                => $args,
					],
				]
			);
		}
	}

	/**
	 * Validate a positive decimal post ID.
	 *
	 * @param mixed $value Request parameter.
	 */
	public static function validate_post_id( mixed $value ): bool|\WP_Error {
		if ( ( \is_int( $value ) || \is_string( $value ) ) && 1 === \preg_match( '/^[1-9][0-9]*$/D', (string) $value ) && (string) (int) $value === (string) $value ) {
			return true;
		}
		return new \WP_Error( 'blixis_invalid_post_id', 'Invalid post ID.', [ 'status' => 400 ] );
	}

	/**
	 * Validate a locale against the storage grammar.
	 *
	 * @param mixed $value Request parameter.
	 */
	public static function validate_locale( mixed $value ): bool|\WP_Error {
		if ( \is_string( $value ) && \Blixis\Builder\Storage\MetaKeys::is_valid_locale( $value ) ) {
			return true;
		}
		return new \WP_Error( 'blixis_invalid_locale', 'Invalid locale.', [ 'status' => 400 ] );
	}

	/** Check authentication, post existence/type and edit_post uniformly.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	public function permission( \WP_REST_Request $request ): true|\WP_Error {
		$result = $this->documents->permission( (int) $request->get_param( 'post_id' ) );
		return null === $result ? true : self::error( $result );
	}

	/** Read a working stream without changing state.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	public function get( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		return self::response( $this->documents->get( (int) $request->get_param( 'post_id' ), self::locale( $request ) ) );
	}

	/** Write a working stream using the If-Match precondition.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	public function put( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
		$if_match = $request->get_header( 'if-match' );
		return self::response( $this->documents->put( (int) $request->get_param( 'post_id' ), self::locale( $request ), '' === $if_match ? null : $if_match, $request->get_body(), (string) $request->get_header( 'content-type' ) ) );
	}

	/** Content routes carry a locale; layout routes do not.
	 *
	 * @param \WP_REST_Request $request REST request.
	 */
	private static function locale( \WP_REST_Request $request ): ?string {
		$value = $request->get_param( 'locale' );
		return \is_string( $value ) ? $value : null;
	}

	/** Convert a policy result to WordPress REST response types.
	 *
	 * @param DocumentResult $result Policy result.
	 */
	private static function response( DocumentResult $result ): \WP_REST_Response|\WP_Error {
		if ( null !== $result->error_code ) {
			return self::error( $result );
		}
		$response = new \WP_REST_Response( $result->body, $result->status );
		$response->header( 'ETag', DocumentRequest::etag( $result->revision ?? 0 ) );
		$response->header( 'Cache-Control', 'private, no-store' );
		return $response;
	}

	/** Attach the status and safe conflict metadata to every plugin error.
	 *
	 * @param DocumentResult $result Policy result.
	 */
	private static function error( DocumentResult $result ): \WP_Error {
		return new \WP_Error( $result->error_code ?? 'blixis_storage_error', $result->message ?? 'Document storage failed.', \array_merge( [ 'status' => $result->status ], $result->body ) );
	}
}
