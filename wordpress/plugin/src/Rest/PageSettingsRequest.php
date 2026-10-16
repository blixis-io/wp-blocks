<?php
/**
 * Page settings REST policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Rest;

use Blixis\Builder\Locale\LocaleConfig;
use Blixis\Builder\Seo\Url;
use Blixis\Builder\Storage\Database;
use Blixis\Builder\Storage\WpdbDatabase;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Publication\RateLimiter;
use Blixis\Builder\Theme\ThemeCompat;
use Blixis\Builder\Theme\WordPressCompatibilityReader;
\defined( 'ABSPATH' ) || exit;

/** Validates and applies page settings without mass assignment. */
final class PageSettingsRequest {
	/** Create the request policy.
	 *
	 * @param PostAccess   $access Post access policy.
	 * @param ?RateLimiter $limiter Write rate limit.
	 * @param ?Database    $database Storage used for the per-post write lock.
	 */
	public function __construct( private readonly PostAccess $access, private ?RateLimiter $limiter = null, private ?Database $database = null ) {}

	/** Check the same post access policy as document routes.
	 *
	 * @param int  $id Post ID.
	 * @param bool $write Whether this changes state.
	 */
	public function permission( int $id, bool $write ): ?DocumentResult {
		return ( new ThemeGuard( $this->access, new ThemeCompat( new WordPressCompatibilityReader() ) ) )->permission( $id, $write );
	}

	/** Read the page settings and locale defaults.
	 *
	 * @param int $id Post ID.
	 * @return array<string, mixed>|DocumentResult
	 */
	public function get( int $id ): array|DocumentResult {
		$post = \get_post( $id );
		if ( ! $post instanceof \WP_Post ) {
			return DocumentResult::error( 403, 'blixis_forbidden', 'Access is forbidden.' );
		}
		$config   = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		$stored   = \get_post_meta( $id, MetaKeys::SEO, true );
		$envelope = \is_string( $stored ) ? \json_decode( $stored, true ) : [];
		$values   = \is_array( $envelope ) && \is_array( $envelope['locales'] ?? null ) ? $envelope['locales'] : [];
		$seo      = [];
		foreach ( $config->enabled as $locale ) {
			$seo[ $locale ] = \array_merge( self::defaults(), \is_array( $values[ $locale ] ?? null ) ? $values[ $locale ] : [] ); }
		$thumbnail = \get_post_thumbnail_id( $id );
		$image     = null;
		if ( $thumbnail ) {
			$src = \wp_get_attachment_image_src( $thumbnail, 'full' );
			if ( \is_array( $src ) && self::same_origin( $src[0] ) ) {
				$image = [
					'id'     => (int) $thumbnail,
					'url'    => $src[0],
					'alt'    => (string) \get_post_meta( $thumbnail, '_wp_attachment_image_alt', true ),
					'width'  => (int) $src[1],
					'height' => (int) $src[2],
				]; }
		}
		return [
			'title'         => (string) $post->post_title,
			'slug'          => (string) $post->post_name,
			'status'        => (string) $post->post_status,
			'excerpt'       => (string) \get_post_field( 'post_excerpt', $id ),
			'featuredImage' => $image,
			'seo'           => (object) $seo,
			'locales'       => $config->enabled,
			'version'       => self::version( $post ),
		];
	}

	/** Validate the whole request, then persist the explicitly supported fields.
	 *
	 * @param int         $id Post ID.
	 * @param string|null $if_match Current version token.
	 * @param string      $body JSON body.
	 * @param int         $actor Current user ID.
	 */
	public function put( int $id, ?string $if_match, string $body, int $actor ): DocumentResult {
		$post = \get_post( $id );
		if ( ! $post instanceof \WP_Post ) {
			return DocumentResult::error( 403, 'blixis_forbidden', 'Access is forbidden.' ); }
		if ( null === $if_match || '' === $if_match ) {
			return DocumentResult::error( 428, 'blixis_precondition_required', 'If-Match is required.' ); }
		$current = self::version( $post );
		if ( ! \hash_equals( '"' . $current . '"', $if_match ) ) {
			return DocumentResult::error(
				409,
				'blixis_conflict',
				'Revision conflict.',
				[
					'current' => $current,
					'version' => $current,
				]
			); }
		if ( \strlen( $body ) > 65536 ) {
			return DocumentResult::error( 413, 'blixis_too_large', 'Page settings are too large.' ); }
		$data    = \json_decode( $body, true, 16 );
		$allowed = [ 'title', 'slug', 'excerpt', 'featuredImageId', 'seo' ];
		/** Validation errors are collected before any writes.
		 *
		 * @var list<array{field:string,code:string,message:string}> $errors
		 */
		$errors = [];
		if ( ! \is_array( $data ) || ( [] !== $data && \array_is_list( $data ) ) || [] !== \array_diff( \array_keys( $data ), $allowed ) ) {
			return self::invalid(
				[
					[
						'field'   => 'body',
						'code'    => 'unknown_or_invalid_key',
						'message' => 'Request body contains unknown or invalid keys.',
					],
				]
			); }
		$clean = [];
		foreach ( [
			'title'   => 200,
			'excerpt' => 1000,
		] as $field => $max ) {
			if ( ! \array_key_exists( $field, $data ) ) {
				continue; }
			$value = $data[ $field ];
			if ( ! \is_string( $value ) || ! self::valid_plain_text( $value, $max * 8 ) ) {
				$errors[] = self::err( $field, 'invalid_text', 'Invalid plain text.' );
				continue; }
			$value = self::plain_text( $value );
			if ( \mb_strlen( $value ) > $max ) {
				$errors[] = self::err( $field, 'too_long', 'Text exceeds the allowed length.' );
			} else {
				$clean[ $field ] = $value; }
		}
		if ( \array_key_exists( 'slug', $data ) ) {
			if ( ! \is_string( $data['slug'] ) || \strlen( $data['slug'] ) > 800 || 1 === \preg_match( '/\p{Cc}/u', $data['slug'] ) ) {
				$errors[] = self::err( 'slug', 'invalid_slug', 'Invalid slug.' ); } else {
				$slug = \sanitize_title( $data['slug'] );
				if ( '' === $slug || \mb_strlen( $slug ) > 200 ) {
					$errors[] = self::err( 'slug', 'invalid_slug', 'Slug must contain 1 to 200 characters.' );
				} else {
						$clean['slug'] = \wp_unique_post_slug( $slug, $id, $post->post_status, $post->post_type, (int) \get_post_field( 'post_parent', $id ) ); }
				}
		}
		if ( \array_key_exists( 'featuredImageId', $data ) ) {
			$clean['featuredImageId'] = $data['featuredImageId'];
			if ( null !== $data['featuredImageId'] && ( ! \is_int( $data['featuredImageId'] ) || ! self::readable_image( $data['featuredImageId'] ) ) ) {
				$errors[] = self::err( 'featuredImageId', 'invalid_image', 'Image must be a readable image attachment.' ); }
		}
		if ( \array_key_exists( 'seo', $data ) ) {
			$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
			if ( ! \is_array( $data['seo'] ) || ( [] !== $data['seo'] && \array_is_list( $data['seo'] ) ) ) {
				$errors[] = self::err( 'seo', 'invalid_map', 'SEO must be a locale map.' ); } else {
				$seo = [];
				foreach ( $data['seo'] as $locale => $fields ) {
					if ( ! \in_array( $locale, $config->enabled, true ) || ! \is_array( $fields ) || ( [] !== $fields && \array_is_list( $fields ) ) ) {
						$errors[] = self::err( 'seo.' . $locale, 'invalid_locale', 'Locale is not enabled or fields are invalid.' );
						continue; }
					$defaults = self::defaults();
					$row      = $defaults;
					if ( [] !== \array_diff( \array_keys( $fields ), \array_keys( $defaults ) ) ) {
						$errors[] = self::err( 'seo.' . $locale, 'unknown_key', 'Unknown SEO field.' );
						continue; }
					foreach ( $fields as $field => $value ) {
						if ( \in_array( $field, [ 'noindex', 'nofollow' ], true ) ) {
							if ( ! \is_bool( $value ) ) {
								$errors[] = self::err( 'seo.' . $locale . '.' . $field, 'invalid_boolean', 'Expected a boolean.' );
							} else {
								$row[ $field ] = $value;
							} continue; }
						if ( 'ogImageId' === $field ) {
							if ( null !== $value && ( ! \is_int( $value ) || ! self::readable_image( $value ) ) ) {
								$errors[] = self::err( 'seo.' . $locale . '.ogImageId', 'invalid_image', 'Image must be a readable image attachment.' );
							} else {
								$row[ $field ] = $value;
							} continue; }
						if ( 'canonical' === $field ) {
							if ( ! \is_string( $value ) || \strlen( $value ) > 500 || ! self::canonical( $value ) ) {
								$errors[] = self::err( 'seo.' . $locale . '.canonical', 'invalid_url', 'Canonical URL must be an absolute same-host HTTP URL.' );
							} else {
								$row[ $field ] = $value;
							} continue; }
						$limits = [
							'metaTitle'       => 120,
							'metaDescription' => 320,
							'ogTitle'         => 120,
							'ogDescription'   => 320,
						];
						if ( ! \is_string( $value ) || ! self::valid_plain_text( $value, $limits[ $field ] * 8 ) ) {
							$errors[] = self::err( 'seo.' . $locale . '.' . $field, 'invalid_text', 'Invalid plain text.' );
							continue; }
						$value = self::plain_text( $value );
						if ( \mb_strlen( $value ) > $limits[ $field ] ) {
							$errors[] = self::err( 'seo.' . $locale . '.' . $field, 'too_long', 'Text exceeds the allowed length.' );
						} else {
							$row[ $field ] = $value; }
					}
					$seo[ $locale ] = $row;
				}
				$clean['seo'] = $seo;
				}
		}
		if ( [] !== $errors ) {
			return self::invalid( $errors ); }
		if ( null !== $this->limiter && $actor > 0 && $this->limiter->retry_after( $actor, $id ) > 0 ) {
			return DocumentResult::error( 429, 'blixis_rate_limited', 'Rate limit reached.', [ 'retryAfter' => $this->limiter->retry_after( $actor, $id ) ] ); }
		if ( null !== $this->database ) {
			try {
				$this->database->lock( $id, MetaKeys::PAGE_VERSION );
			} catch ( \RuntimeException ) {
				return DocumentResult::error( 500, 'blixis_storage_error', 'Page settings could not be saved.' );
			}
		}
		try {
			// Re-check under the lock: another writer may have saved between the first check and now.
			\clean_post_cache( $id );
			$locked = \get_post( $id );
			if ( ! $locked instanceof \WP_Post || ! \hash_equals( '"' . self::version( $locked ) . '"', $if_match ) ) {
				$latest = $locked instanceof \WP_Post ? self::version( $locked ) : '';
				return DocumentResult::error(
					409,
					'blixis_conflict',
					'Revision conflict.',
					[
						'current' => $latest,
						'version' => $latest,
					]
				);
			}
			return $this->apply( $id, $clean, $actor );
		} finally {
			if ( null !== $this->database ) {
				$this->database->unlock( $id, MetaKeys::PAGE_VERSION );
			}
		}
	}

	/** Persist validated page settings (the caller holds the lock and has verified the version).
	 *
	 * @param int                  $id Post ID.
	 * @param array<string, mixed> $clean Validated fields.
	 * @param int                  $actor Current user ID.
	 */
	private function apply( int $id, array $clean, int $actor ): DocumentResult {
		$update = [ 'ID' => $id ];
		foreach ( [
			'title'   => 'post_title',
			'slug'    => 'post_name',
			'excerpt' => 'post_excerpt',
		] as $from => $to ) {
			if ( \array_key_exists( $from, $clean ) ) {
				$update[ $to ] = $clean[ $from ]; }
		}
		$updated = \wp_update_post( \wp_slash( $update ), true );
		if ( \is_wp_error( $updated ) || 0 === $updated ) {
			return DocumentResult::error( 500, 'blixis_storage_error', 'Page settings could not be saved.' );
		}
		if ( \array_key_exists( 'featuredImageId', $clean ) ) {
			null === $clean['featuredImageId'] ? \delete_post_thumbnail( $id ) : \set_post_thumbnail( $id, $clean['featuredImageId'] ); }
		if ( \array_key_exists( 'seo', $clean ) ) {
			\update_post_meta(
				$id,
				MetaKeys::SEO,
				\wp_slash(
					\wp_json_encode(
						[
							'schemaVersion' => 1,
							'locales'       => $clean['seo'],
						]
					)
				)
			); }
		// Every write moves the token, even two writes within one second (post_modified_gmt has one-second resolution).
		\update_post_meta( $id, MetaKeys::PAGE_VERSION, (string) ( (int) \get_post_meta( $id, MetaKeys::PAGE_VERSION, true ) + 1 ) );
		if ( null !== $this->limiter && $actor > 0 ) {
			$this->limiter->record( $actor, $id ); }
		\clean_post_cache( $id );
		$saved_post = \get_post( $id );
		if ( ! $saved_post instanceof \WP_Post ) {
			return DocumentResult::error( 500, 'blixis_storage_error', 'Page settings could not be saved.' );
		}
		return DocumentResult::success( [ 'version' => self::version( $saved_post ) ], 0 );
	}

	/** Return SEO defaults for the supported fields.
	 *
	 * @return array<string, string|int|bool|null>
	 */
	private static function defaults(): array {
		return [
			'metaTitle'       => '',
			'metaDescription' => '',
			'ogTitle'         => '',
			'ogDescription'   => '',
			'ogImageId'       => null,
			'noindex'         => false,
			'nofollow'        => false,
			'canonical'       => '',
		]; }
	/** Build the opaque token from post modification time and ID.
	 *
	 * @param \WP_Post $post WordPress post.
	 */
	private static function version( \WP_Post $post ): string {
		return \sha1( (string) \get_post_meta( (int) $post->ID, MetaKeys::PAGE_VERSION, true ) . ':' . (string) $post->post_modified_gmt . ':' . (int) $post->ID ); }
	/** Build a field validation error.
	 *
	 * @param string $field Error field.
	 * @param string $code Stable code.
	 * @param string $message Safe message.
	 * @return array{field:string,code:string,message:string}
	 */
	private static function err( string $field, string $code, string $message ): array {
		return [
			'field'   => $field,
			'code'    => $code,
			'message' => $message,
		]; }
	/** Build the validation result.
	 *
	 * @param list<array{field:string,code:string,message:string}> $errors Field errors.
	 */
	private static function invalid( array $errors ): DocumentResult {
		return DocumentResult::error( 400, 'blixis_invalid_page_settings', 'Page settings are invalid.', [ 'errors' => $errors ] ); }
	/** Check that the user can read an image attachment.
	 *
	 * @param int $id Attachment ID.
	 */
	private static function readable_image( int $id ): bool {
		return 'attachment' === \get_post_type( $id ) && \current_user_can( 'read_post', $id ) && \str_starts_with( (string) \get_post_mime_type( $id ), 'image/' ) && false !== \wp_get_attachment_image_src( $id, 'full' ); }
	/** Canonical URL policy shared with SEO rendering.
	 *
	 * @param string $url Candidate URL.
	 */
	public static function canonical( string $url ): bool {
		return Url::same_origin_http( $url );
	}

	/** Fully normalize stored SEO data. Invalid fields fall back to safe defaults.
	 *
	 * @param mixed $value Untrusted locale SEO row.
	 * @return array<string, string|int|bool|null>
	 */
	public static function normalize_seo_read( mixed $value ): array {
		$row = self::defaults();
		if ( ! \is_array( $value ) ) {
			return $row; }
		foreach ( [
			'metaTitle'       => 120,
			'metaDescription' => 320,
			'ogTitle'         => 120,
			'ogDescription'   => 320,
		] as $field => $max ) {
			if ( isset( $value[ $field ] ) && \is_string( $value[ $field ] ) ) {
				$text          = \trim( \preg_replace( '/\\s+/u', ' ', \wp_strip_all_tags( $value[ $field ] ) ) ?? '' );
				$row[ $field ] = \mb_substr( $text, 0, $max );
			}
		}
		foreach ( [ 'noindex', 'nofollow' ] as $field ) {
			$row[ $field ] = isset( $value[ $field ] ) && true === $value[ $field ]; }
		$image            = $value['ogImageId'] ?? null;
		$row['ogImageId'] = \is_int( $image ) && $image > 0 && 'attachment' === \get_post_type( $image ) && \str_starts_with( (string) \get_post_mime_type( $image ), 'image/' ) ? $image : null;
		$canonical        = $value['canonical'] ?? '';
		$row['canonical'] = \is_string( $canonical ) && \strlen( $canonical ) <= 500 && self::canonical( $canonical ) ? $canonical : '';
		return $row;
	}

	/** Fully validate and normalize an SEO locale map for endpoint and meta writes.
	 *
	 * @param mixed $value SEO locale map.
	 * @return ?array<string, array<string, string|int|bool|null>>
	 */
	public static function validate_seo_map( mixed $value ): ?array {
		$config = LocaleConfig::from_option( \get_option( LocaleConfig::OPTION, false ), \get_locale() );
		if ( ! \is_array( $value ) || ( [] !== $value && \array_is_list( $value ) ) ) {
			return null; }
		$out = [];
		foreach ( $value as $locale => $fields ) {
			if ( ! \is_string( $locale ) || ! \in_array( $locale, $config->enabled, true ) || ! \is_array( $fields ) || ( [] !== $fields && \array_is_list( $fields ) ) || [] !== \array_diff( \array_keys( $fields ), \array_keys( self::defaults() ) ) ) {
				return null; }
			$row = self::defaults();
			foreach ( $fields as $field => $v ) {
				if ( in_array( $field, [ 'noindex', 'nofollow' ], true ) ) {
					if ( ! \is_bool( $v ) ) {
						return null;
					} $row[ $field ] = $v;
					continue; }
				if ( 'ogImageId' === $field ) {
					if ( null !== $v && ( ! \is_int( $v ) || ! self::readable_image( $v ) ) ) {
						return null;
					} $row[ $field ] = $v;
					continue; }
				if ( 'canonical' === $field ) {
					if ( ! \is_string( $v ) || \strlen( $v ) > 500 || ! self::canonical( $v ) ) {
						return null;
					} $row[ $field ] = $v;
					continue; }
				$limits = [
					'metaTitle'       => 120,
					'metaDescription' => 320,
					'ogTitle'         => 120,
					'ogDescription'   => 320,
				];
				if ( ! \is_string( $v ) || ! self::valid_plain_text( $v, $limits[ $field ] * 8 ) ) {
					return null; }
				$text = self::plain_text( $v );
				if ( \mb_strlen( $text ) > $limits[ $field ] ) {
					return null;
				} $row[ $field ] = $text;
			}
			$out[ $locale ] = $row;
		}
		return $out;
	}

	/** Reject invalid UTF-8, controls and unreasonable input before stripping tags.
	 *
	 * @param string $value Input text.
	 * @param int    $byte_limit Maximum input size.
	 */
	private static function valid_plain_text( string $value, int $byte_limit ): bool {
		return \strlen( $value ) <= $byte_limit
			&& false !== \preg_match( '//u', $value )
			&& 1 !== \preg_match( '/\p{Cc}/u', $value );
	}

	/** Strip markup and normalize all whitespace to single spaces.
	 *
	 * @param string $value Input text.
	 */
	private static function plain_text( string $value ): string {
		$stripped = \wp_strip_all_tags( $value );
		return \trim( \preg_replace( '/\s+/u', ' ', $stripped ) ?? '' );
	}
	/** Check whether an image URL has the site origin.
	 *
	 * @param string $url Candidate URL.
	 */
	private static function same_origin( string $url ): bool {
		$a = \wp_parse_url( $url );
		$b = \wp_parse_url( \home_url() );
		return \is_array( $a ) && \is_array( $b ) && \strtolower( (string) ( $a['scheme'] ?? '' ) ) === \strtolower( (string) ( $b['scheme'] ?? '' ) ) && \strtolower( (string) ( $a['host'] ?? '' ) ) === \strtolower( (string) ( $b['host'] ?? '' ) ) && (int) ( $a['port'] ?? 0 ) === (int) ( $b['port'] ?? 0 ); }
}
