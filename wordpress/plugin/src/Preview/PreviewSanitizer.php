<?php
/** Conservative final HTML rejection boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Inspects tags and attributes only; ordinary text is never treated as markup. */
final class PreviewSanitizer {
	private const FORBIDDEN_TAGS     = [ 'html', 'body', 'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'style' ];
	private const SVG_TAGS           = [ 'svg', 'path', 'circle' ];
	private const URL_ATTRIBUTES     = [ 'href', 'src', 'xlink:href', 'action', 'formaction', 'poster' ];
	private const FORM_CONTROL_TYPES = [ 'text', 'email', 'password', 'number', 'url', 'search', 'hidden' ];

	/**
	 * Apply the documented contract.
	 *
	 * @param string $html Html.
	 */
	public static function accepts( string $html ): bool {
		if ( 1 !== \preg_match( '//u', $html ) || \str_contains( $html, "\0" ) ) {
			return false;
		}
		$offset      = 0;
		$inside_svg  = false;
		$inside_form = false;
		$form_kind   = '';
		while ( true ) {
			$start = \strpos( $html, '<', $offset );
			if ( false === $start ) {
				break;
			}
			$end = \strpos( $html, '>', $start + 1 );
			if ( false === $end ) {
				return false;
			}
			$tag = \substr( $html, $start + 1, $end - $start - 1 );
			if ( \str_contains( $tag, '<' ) || ! self::accepts_tag( $tag, $inside_svg, $inside_form, $form_kind ) ) {
				return false;
			}
			$offset = $end + 1;
		}
		return ! $inside_svg && ! $inside_form;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	private static function decode( string $value ): string {
		for ( $i = 0; $i < 5; ++$i ) {
			$next = \html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			if ( $next === $value ) {
				break;
			}
			$value = $next;
		}
		return $value;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $source Source.
	 * @param bool   $inside_svg Whether the current tag is inside a permitted SVG.
	 * @param bool   $inside_form Whether the current tag is inside a permitted form.
	 * @param string $form_kind The permitted form kind.
	 */
	private static function accepts_tag( string $source, bool &$inside_svg, bool &$inside_form, string &$form_kind ): bool {
		if ( 1 !== \preg_match( '~^\s*(/?)\s*([a-z][a-z0-9:-]*)(.*)$~isD', $source, $match ) ) {
			return false;
		}
		$name = \strtolower( $match[2] );
		if ( \in_array( $name, self::FORBIDDEN_TAGS, true ) || ( $inside_svg && ! \in_array( $name, self::SVG_TAGS, true ) ) ) {
			return false;
		}
		$submission_feedback = $inside_form && 'submission' === $form_kind && \in_array( $name, [ 'div', 'p', 'strong' ], true );
		if ( $inside_form && ! $submission_feedback && ! \in_array( $name, [ 'form', 'label', 'input', 'button' ], true ) ) {
			return false;
		}
		$rest = $match[3];
		if ( '/' === $match[1] ) {
			if ( 'form' === $name ) {
				if ( ! $inside_form || '' !== \trim( $rest ) ) {
					return false;
				}
				$inside_form = false;
				$form_kind   = '';
				return true;
			}
			if ( '' !== \trim( $rest ) || ( $inside_svg && 'svg' !== $name ) || ( ! $inside_svg && \in_array( $name, self::SVG_TAGS, true ) ) ) {
				return false;
			}
			$inside_svg = false;
			return true;
		}
		if ( $inside_svg && 'svg' === $name ) {
			return false;
		}
		if ( 'form' === $name ) {
			if ( $inside_form || $inside_svg || \str_ends_with( \trim( $rest ), '/' ) ) {
				return false;
			}
		}
		if ( ! $inside_svg && 'svg' === $name ) {
			if ( \str_ends_with( \trim( $rest ), '/' ) ) {
				return false;
			}
			$inside_svg = true;
		}
		if ( $inside_svg && 'svg' !== $name && ! \str_ends_with( \trim( $rest ), '/' ) ) {
			return false;
		}
		$form_attributes = [];
		while ( '' !== \trim( $rest ) ) {
			if ( 1 === \preg_match( '~^\s*/\s*$~', $rest ) ) {
				return true;
			}
			if ( 1 !== \preg_match( '~^\s+([a-z_:][a-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'`=<>]+)))?(.*)$~isD', $rest, $attribute, PREG_UNMATCHED_AS_NULL ) ) {
				return false;
			}
			$key   = \strtolower( $attribute[1] );
			$value = self::decode( $attribute[2] ?? $attribute[3] ?? $attribute[4] ?? '' );
			if ( 'form' === $name ) {
				if ( ! self::accepts_search_form_attribute( $key, $value ) ) {
					return false;
				}
				if ( isset( $form_attributes[ $key ] ) ) {
					return false;
				}
				$form_attributes[ $key ] = $value;
			} elseif ( $inside_form && $submission_feedback && ! self::accepts_feedback_attribute( $key, $value ) ) {
				return false;
			} elseif ( $inside_form && ! $submission_feedback && ! self::accepts_form_control_attribute( $name, $key, $value, $form_kind ) ) {
				return false;
			}
			if ( \str_starts_with( $key, 'on' ) || \in_array( $key, [ 'style', 'srcdoc' ], true ) ) {
				if ( 'style' !== $key || ! self::accepts_style( $value ) ) {
					return false;
				}
			}
			if ( \in_array( $name, self::SVG_TAGS, true ) && ! self::accepts_svg_attribute( $key, $value ) ) {
				return false;
			}
			if ( \in_array( $key, self::URL_ATTRIBUTES, true ) && ! \Blixis\Builder\Registry\SafeUrl::accepts( $value ) ) {
				return false;
			}
			$rest = $attribute[5];
		}
		if ( 'form' === $name ) {
			$method = \strtolower( $form_attributes['method'] ?? '' );
			if ( ! self::is_same_origin_url( $form_attributes['action'] ?? '' ) ) {
				return false;
			}
			if ( 'search' === ( $form_attributes['role'] ?? '' ) && 'get' === $method && 'blixis/site-search' === ( $form_attributes['data-blx-type'] ?? '' ) ) {
				$form_kind = 'search';
			} elseif ( 'post' === $method && \in_array( $form_attributes['data-blx-form'] ?? '', [ 'contact', 'newsletter' ], true ) && \in_array( $form_attributes['data-blx-type'] ?? '', [ 'blixis/form', 'blixis/contact-form', 'blixis/newsletter-signup' ], true ) ) {
				$form_kind = 'submission';
			} else {
				return false;
			}
			$inside_form = true;
		}
		return true;
	}

	/** Permit only the renderer's same-site search and submission form attributes.
	 *
	 * @param string $tag Tag name.
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 * @param string $form_kind Form kind.
	 */
	private static function accepts_form_control_attribute( string $tag, string $key, string $value, string $form_kind ): bool {
		if ( 'search' === $form_kind ) {
			return self::accepts_search_control_attribute( $tag, $key, $value );
		}
		if ( 'data-blx-id' === $key ) {
			return 1 === \preg_match( '/^[A-Za-z0-9_-]{1,128}$/D', $value );
		}
		if ( 'data-blx-type' === $key ) {
			return 1 === \preg_match( '~^blixis/(?:form|contact-form|newsletter-signup|(?:text|email|password|number|url|search|hidden)-field|submit-button)$~D', $value );
		}
		if ( 'class' === $key ) {
			return 'label' === $tag ? 'screen-reader-text' === $value : 1 === \preg_match( '/^blx-(?:c-)?[0-9a-f]{12}(?: blx-(?:c-)?[0-9a-f]{12})*$/D', $value );
		}
		if ( 'label' === $tag ) {
			return ( 'for' === $key && 1 === \preg_match( '/^blx-field-[0-9a-f]{12}$/D', $value ) ) || ( 'aria-hidden' === $key && 'true' === $value );
		}
		if ( 'button' === $tag ) {
			return 'type' === $key && 'submit' === $value;
		}
		if ( 'input' !== $tag ) {
			return false;
		}
		$patterns = [
			'id'           => '/^(?:blx-field-[0-9a-f]{12}|_wpnonce)$/D',
			'type'         => '/^(?:' . \implode( '|', self::FORM_CONTROL_TYPES ) . ')$/D',
			'name'         => '/^(?:action|post_id|form_id|_wpnonce|company_website|fields\[[A-Za-z][A-Za-z0-9_.:-]{0,63}\])$/D',
			'autocomplete' => '/^(?:off|on|name|email|username|new-password|current-password|url|search|tel|given-name|family-name)$/D',
			'value'        => '/^[^\x00]*$/D',
			'placeholder'  => '/^[^\x00]*$/D',
			'tabindex'     => '/^-1$/D',
			'minlength'    => '/^\d{1,5}$/D',
			'maxlength'    => '/^\d{1,5}$/D',
			'min'          => '/^-?\d+(?:\.\d+)?$/D',
			'max'          => '/^-?\d+(?:\.\d+)?$/D',
		];
		if ( 'required' === $key || 'disabled' === $key ) {
			return '' === $value;
		}
		return isset( $patterns[ $key ] ) && 1 === \preg_match( $patterns[ $key ], $value );
	}

	/** Permit only safe status markup inside a submission form.
	 *
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 */
	private static function accepts_feedback_attribute( string $key, string $value ): bool {
		if ( 'role' === $key ) {
			return \in_array( $value, [ 'status', 'alert' ], true );
		}
		if ( 'data-blx-id' === $key ) {
			return 1 === \preg_match( '/^[A-Za-z0-9_-]{1,128}$/D', $value );
		}
		if ( 'data-blx-type' === $key ) {
			return 'blixis/form-success' === $value || 'blixis/form-error' === $value;
		}
		return 'class' === $key && 1 === \preg_match( '/^blx-(?:c-)?[0-9a-f]{12}(?: blx-(?:c-)?[0-9a-f]{12})*$/D', $value );
	}

	/** Permit only the attributes required by a native same-site search form.
	 *
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 */
	private static function accepts_search_form_attribute( string $key, string $value ): bool {
		if ( 'data-blx-id' === $key ) {
			return 1 === \preg_match( '/^[A-Za-z0-9_-]{1,128}$/D', $value );
		}
		if ( 'data-blx-type' === $key ) {
			return 'blixis/site-search' === $value || \in_array( $value, [ 'blixis/form', 'blixis/contact-form', 'blixis/newsletter-signup' ], true );
		}
		if ( 'data-blx-form' === $key ) {
			return \in_array( $value, [ 'contact', 'newsletter' ], true );
		}
		if ( 'aria-label' === $key ) {
			return '' !== $value && ! \str_contains( $value, "\0" );
		}
		if ( 'class' === $key ) {
			return 1 === \preg_match( '/^blx-(?:c-)?[0-9a-f]{12}(?: blx-(?:c-)?[0-9a-f]{12})*$/D', $value );
		}
		if ( 'role' === $key ) {
			return 'search' === $value;
		}
		if ( 'method' === $key ) {
			return \in_array( \strtolower( $value ), [ 'get', 'post' ], true );
		}
		if ( 'action' === $key ) {
			return self::is_same_origin_url( $value );
		}
		if ( 'data-blx-id' === $key ) {
			return 1 === \preg_match( '/^[A-Za-z0-9_-]{1,128}$/D', $value );
		}
		if ( 'data-blx-type' === $key ) {
			return 'blixis/site-search' === $value;
		}
		return 'class' === $key && 1 === \preg_match( '/^blx-(?:c-)?[0-9a-f]{12}(?: blx-(?:c-)?[0-9a-f]{12})*$/D', $value );
	}

	/** Permit only native search controls within the approved form.
	 *
	 * @param string $tag Tag name.
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 */
	private static function accepts_search_control_attribute( string $tag, string $key, string $value ): bool {
		if ( 'label' === $tag ) {
			return 'for' === $key && 1 === \preg_match( '/^blx-search-[0-9a-f]{12}$/D', $value );
		}
		if ( 'input' === $tag ) {
			$patterns = [
				'id'          => '/^blx-search-[0-9a-f]{12}$/D',
				'type'        => '/^search$/D',
				'name'        => '/^s$/D',
				'value'       => '/^[^\x00]*$/D',
				'placeholder' => '/^[^\x00]*$/D',
			];
			return isset( $patterns[ $key ] ) && 1 === \preg_match( $patterns[ $key ], $value );
		}
		return 'button' === $tag && 'type' === $key && 'submit' === $value;
	}

	/** Require the form action to use the configured WordPress site's origin.
	 *
	 * @param string $value Action URL.
	 */
	private static function is_same_origin_url( string $value ): bool {
		if ( ! \Blixis\Builder\Registry\SafeUrl::accepts( $value ) ) {
			return false;
		}
		if ( 1 === \preg_match( '~^/(?!/)~D', $value ) ) {
			return true;
		}
		if ( ! \function_exists( 'home_url' ) || ! \function_exists( 'wp_parse_url' ) ) {
			return false;
		}
		$target = \wp_parse_url( $value );
		$home   = \wp_parse_url( \home_url( '/' ) );
		if ( ! \is_array( $target ) || ! \is_array( $home ) || ! isset( $target['scheme'], $target['host'], $home['scheme'], $home['host'] ) ) {
			return false;
		}
		$target_port = $target['port'] ?? ( 'https' === \strtolower( $target['scheme'] ) ? 443 : 80 );
		$home_port   = $home['port'] ?? ( 'https' === \strtolower( $home['scheme'] ) ? 443 : 80 );
		return \strtolower( $target['scheme'] ) === \strtolower( $home['scheme'] ) && \strtolower( $target['host'] ) === \strtolower( $home['host'] ) && $target_port === $home_port && ! isset( $target['user'] ) && ! isset( $target['pass'] );
	}

	/** Accept only renderer-generated, non-executable style declarations.
	 *
	 * @param string $value Style value.
	 */
	private static function accepts_style( string $value ): bool {
		if ( 1 === \preg_match( '/^--blx-hotspot-x:(?:100|[1-9]?[0-9](?:\.[0-9]{1,2})?)%;--blx-hotspot-y:(?:100|[1-9]?[0-9](?:\.[0-9]{1,2})?)%$/D', $value ) ) {
			return true;
		}
		if ( 1 === \preg_match( '/^--blx-headline-index:(?:[0-9]|[1-9][0-9]|100)$/D', $value ) ) {
			return true;
		}
		return 1 === \preg_match( '/^background-image:linear-gradient\((?:360|3[0-5][0-9]|[12]?[0-9]{1,2}(?:\.[0-9]{1,2})?)deg,(?:#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?: (?:100|[1-9]?[0-9](?:\.[0-9]{1,2})?)%)?,?){2,8}\);-webkit-background-clip:text;background-clip:text;color:transparent$/D', $value );
	}

	/** Restrict inline SVG to the fixed geometry emitted by the icon renderer.
	 *
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 */
	private static function accepts_svg_attribute( string $key, string $value ): bool {
		$patterns = [
			'viewbox'         => '/^0 0 24 24$/D',
			'width'           => '/^(?:1em|[1-9][0-9]?|1[01][0-9]|12[0-8])$/D',
			'height'          => '/^(?:1em|[1-9][0-9]?|1[01][0-9]|12[0-8])$/D',
			'fill'            => '/^(?:none|currentColor)$/D',
			'stroke'          => '/^(?:none|currentColor)$/D',
			'stroke-width'    => '/^(?:[0-9](?:\.[0-9]{1,2})?)$/D',
			'stroke-linecap'  => '/^(?:round|butt|square)$/D',
			'stroke-linejoin' => '/^(?:round|bevel|miter)$/D',
			'focusable'       => '/^(?:true|false)$/D',
			'aria-hidden'     => '/^(?:true|false)$/D',
			'cx'              => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'cy'              => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'r'               => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'd'               => '/^[MmLlHhVvCcSsQqTtAaZz0-9 .,+-]+$/D',
		];
		return isset( $patterns[ $key ] ) && 1 === \preg_match( $patterns[ $key ], $value );
	}
}
